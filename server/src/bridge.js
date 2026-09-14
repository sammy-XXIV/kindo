const { createPublicClient, http } = require('viem')
const { base } = require('viem/chains')
const { Connection, PublicKey } = require('@solana/web3.js')
const { getAssociatedTokenAddress, getAccount } = require('@solana/spl-token')
const { getCurrentBlockNumber, broadcastTransaction } = require('./nimiqRpc')
const { buildSignedTransfer, MAIN_ALBATROSS } = require('./nimiqWallet')
const simpleswap = require('./simpleswapClient')
const { createInvoice, payInvoice } = require('./bitrefillClient')
const { getNimUsdRate } = require('./nimPrice')
const orderStore = require('./orderStore')

const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
const USDC_SOLANA = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
const NIM_LUNA = 100000

// Ordered so `stepIndex('nim_forwarded') < stepIndex('usdc_landed')` etc. —
// lets a retried/resumed run skip whatever already completed.
const STEPS = [
  'swap_created',
  'nim_forwarded',
  'usdc_landed',
  'fulfilling',
  'done',
]

function stepIndex(step) {
  return step ? STEPS.indexOf(step) : -1
}

const baseClient = createPublicClient({ chain: base, transport: http() })
const solanaConnection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed')

function log(orderId, message) {
  console.log(`[bridge ${orderId}]`, message)
  orderStore.appendLog(orderId, message)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Retries through transient errors (this environment sees occasional
// "fetch failed" connect blips) instead of letting one hiccup fail the
// whole order — only a real timeout without ever succeeding is fatal.
async function pollUntil(checkFn, { intervalMs = 10000, timeoutMs = 20 * 60 * 1000, description }) {
  const deadline = Date.now() + timeoutMs
  let lastErr = null
  while (Date.now() < deadline) {
    try {
      const result = await checkFn()
      if (result) return result
    } catch (err) {
      lastErr = err
    }
    await sleep(intervalMs)
  }
  throw new Error(`Timed out waiting for: ${description}${lastErr ? ` (last error: ${lastErr.message})` : ''}`)
}

async function getBaseUsdcBalance(address) {
  const raw = await baseClient.readContract({
    address: USDC_BASE,
    abi: [
      {
        name: 'balanceOf',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'account', type: 'address' }],
        outputs: [{ name: '', type: 'uint256' }],
      },
    ],
    functionName: 'balanceOf',
    args: [address],
  })
  return Number(raw) / 1e6
}

async function getSolanaUsdcBalance(address) {
  const owner = new PublicKey(address)
  const ata = await getAssociatedTokenAddress(new PublicKey(USDC_SOLANA), owner)
  try {
    const account = await getAccount(solanaConnection, ata)
    return Number(account.amount) / 1e6
  } catch {
    return 0 // ATA doesn't exist yet == zero balance
  }
}

// Prices in an order come from the client and are therefore untrusted: nothing
// stops someone POSTing an order that claims a $10 top-up costs 0.01 NIM. The
// backstop is to re-derive what the customer's NIM was actually worth at
// fulfillment time and never spend more than that, so an under-payment can
// never buy more than it paid for. The tolerance only absorbs NIM/USD drift
// between the quote and the payment landing.
const OVERSPEND_TOLERANCE = 1.05

async function paidUsdFor(order) {
  const rate = await getNimUsdRate()
  return (order.receivedLuna / NIM_LUNA) * rate
}

// Spend budget for this order: what was actually paid, plus drift tolerance.
async function spendBudgetUsd(order) {
  return (await paidUsdFor(order)) * OVERSPEND_TOLERANCE
}

// Refuses a spend that exceeds what the customer paid. The `!(cost <= budget)`
// form also rejects NaN costs rather than letting them through.
async function assertWithinPaid(order, costUsd, label) {
  const budget = await spendBudgetUsd(order)
  if (!(Number(costUsd) <= budget)) {
    throw new Error(
      `Refusing ${label}: cost $${Number(costUsd).toFixed(4)} exceeds paid value $${budget.toFixed(4)}`,
    )
  }
}

// Bitrefill fulfillment (airtime and gift cards): create a price-locked
// invoice, check its real cost against what the customer paid, pay it from
// the Base USDC float. `refillInputOf` yields the recipient (phone for a
// top-up, email for a card that needs one, nothing for a plain code).
function bitrefillFulfillment(label, refillInputOf) {
  return {
    usdcTicker: simpleswap.USDC.BASE,
    label: 'Base',
    address: () => process.env.EVM_ADDRESS,
    getBalance: () => getBaseUsdcBalance(process.env.EVM_ADDRESS),
    fulfill: async (order) => {
      let invoiceId = order.invoiceId
      let invoicePriceUsd = order.invoicePriceUsd
      if (!invoiceId) {
        const invoice = await createInvoice({
          productId: order.item.productId,
          packageValue: order.item.packageValue,
          refillInput: refillInputOf(order),
        })
        invoiceId = invoice.invoice_id
        invoicePriceUsd = Number(invoice.price_usd)
        orderStore.updateOrder(order.orderId, { invoiceId, invoicePriceUsd })
        log(order.orderId, `Created Bitrefill invoice ${invoiceId} for $${invoicePriceUsd}`)
      }
      // Bitrefill's own invoice price is the real cost — verify it against what
      // the customer actually paid. Also runs on the resume path, so a stored
      // invoiceId can never skip the check.
      await assertWithinPaid(order, invoicePriceUsd, label)
      const paid = await payInvoice(invoiceId)
      // Keep Bitrefill's settlement response: for gift cards it is where the
      // redemption code (or the pointer to it) comes back.
      orderStore.updateOrder(order.orderId, { delivery: paid })
      log(order.orderId, `Paid invoice — ${label} delivered`)
    },
  }
}

// Per order-type config: which chain SimpleSwap should deliver USDC to (as its
// ticker + a label for logs), and how to spend it once it lands there.
const FULFILLMENT = {
  'mobile-data': bitrefillFulfillment('top-up', (order) => order.phoneNumber),
  shop: bitrefillFulfillment('gift card', (order) =>
    order.item.recipientType === 'email' ? order.email : undefined,
  ),
  flights: {
    usdcTicker: simpleswap.USDC.SOLANA,
    label: 'Solana',
    address: () => process.env.SOLANA_ADDRESS,
    getBalance: () => getSolanaUsdcBalance(process.env.SOLANA_ADDRESS),
    fulfill: async () => {
      // BRIJ exposes flight *search* only (no booking endpoint yet), so a real
      // ticket can't be issued here. Fully demoable via DEMO_MODE.
      throw new Error('Flight booking unavailable — BRIJ is search-only')
    },
  },
  restaurant: {
    usdcTicker: simpleswap.USDC.BASE,
    label: 'Base',
    address: () => process.env.EVM_ADDRESS,
    getBalance: () => getBaseUsdcBalance(process.env.EVM_ADDRESS),
    fulfill: async () => {
      // AgentRes exposes venue *search* only (no reservation endpoint yet).
      // Fully demoable via DEMO_MODE.
      throw new Error('Reservation unavailable — AgentRes is search-only')
    },
  },
}

// Runs one paid order through to fulfillment. USDC is sourced one of two ways,
// chosen by order size:
//   swap  — the order clears SimpleSwap's ~$22 minimum, so we forward its NIM
//           to a SimpleSwap deposit address and it delivers USDC to our wallet
//           on the fulfillment chain (custodial instant-swap; no HTLC/gas/bridge).
//   float — the order is too small to swap (airtime, small top-ups): we fulfill
//           it from a standing USDC float and let the NIM accrue in the receive
//           wallet toward a later batch swap that refills the float. This is
//           what makes sub-$22 purchases possible at all.
// Every step persists, so a server restart or a retry after a transient failure
// resumes from bridgeStep instead of redoing steps that already moved money.
async function runBridge(orderId) {
  let order = orderStore.getOrder(orderId)
  if (!order) throw new Error(`Unknown order ${orderId}`)

  const config = FULFILLMENT[order.type]
  if (!config) throw new Error(`No fulfillment configured for order type ${order.type}`)

  // DEMO_MODE runs the whole flow shape (bridging -> fulfilled, with logs)
  // without moving funds or calling paid fulfillment providers, so the app can
  // be demoed end-to-end on an empty wallet. Flagged (mode/demo:true) so it's
  // never mistaken for a real order.
  if (process.env.DEMO_MODE === 'true') {
    const nimAmount = order.receivedLuna / NIM_LUNA
    orderStore.updateOrder(orderId, { status: 'bridging', mode: 'demo' })
    log(orderId, `DEMO: simulating ${nimAmount} NIM -> USDC on ${config.label} (no funds moved)`)
    orderStore.updateOrder(orderId, { bridgeStep: 'usdc_landed' })
    orderStore.updateOrder(orderId, { bridgeStep: 'fulfilling' })
    log(orderId, `DEMO: simulated ${order.type} fulfillment — no real order placed`)
    orderStore.updateOrder(orderId, { status: 'fulfilled', bridgeStep: 'done', demo: true })
    return
  }

  const done = (step) => stepIndex(order.bridgeStep) >= stepIndex(step)

  try {
    // Decide once how this order sources its USDC, and persist it so a resumed
    // run stays on the same path: large enough to swap its own NIM, or small
    // enough that it's fulfilled from the float while its NIM accrues.
    if (!order.mode) {
      const nimAmount = order.receivedLuna / NIM_LUNA
      const minNim = await simpleswap.getMinNim(config.usdcTicker)
      const mode = nimAmount >= minNim ? 'swap' : 'float'
      order = orderStore.updateOrder(orderId, { status: 'bridging', mode })
      log(orderId, mode === 'swap'
        ? `Clears the swap minimum (${nimAmount} NIM) — swapping directly on ${config.label}`
        : `Small order: ${nimAmount} NIM < ${minNim} min — fulfilling from the ${config.label} USDC float; NIM accrues`)
    }

    if (order.mode === 'swap' && !done('swap_created')) {
      const nimAmount = order.receivedLuna / NIM_LUNA
      // Snapshot USDC before the swap so we can detect the exact arrival even
      // if the wallet already held some USDC.
      const usdcBefore = await config.getBalance()
      const exchange = await simpleswap.createExchange({
        toTicker: config.usdcTicker,
        amountNim: nimAmount,
        addressTo: config.address(),
        refundAddress: process.env.NIMIQ_ADDRESS,
      })
      order = orderStore.updateOrder(orderId, {
        bridgeStep: 'swap_created',
        swapId: exchange.id,
        depositAddress: exchange.address_from,
        expectedUsdc: exchange.amount_to,
        usdcBefore,
      })
      log(orderId, `Created SimpleSwap ${exchange.id}: ${nimAmount} NIM -> ~${exchange.amount_to} USDC on ${config.label}`)
    }

    if (order.mode === 'swap' && !done('nim_forwarded')) {
      log(orderId, `Forwarding ${order.receivedLuna / NIM_LUNA} NIM to swap deposit ${order.depositAddress}`)
      const validityStartHeight = await getCurrentBlockNumber()
      const rawTx = buildSignedTransfer({
        recipient: order.depositAddress,
        valueLuna: order.receivedLuna,
        validityStartHeight,
        networkId: MAIN_ALBATROSS,
      })
      const depositTxHash = await broadcastTransaction(rawTx)
      order = orderStore.updateOrder(orderId, { bridgeStep: 'nim_forwarded', depositTxHash })
      log(orderId, `Forwarded, tx hash ${depositTxHash}`)
    }

    if (order.mode === 'swap' && !done('usdc_landed')) {
      // SimpleSwap reports `finished` once it has sent the USDC payout.
      await pollUntil(
        async () => {
          const ex = await simpleswap.getExchange(order.swapId)
          if (['failed', 'refunded', 'expired'].includes(ex.status)) {
            throw new Error(`SimpleSwap ${order.swapId} ${ex.status}`)
          }
          return ex.status === 'finished' ? ex : null
        },
        { description: `SimpleSwap ${order.swapId} finishing`, intervalMs: 15000, timeoutMs: 30 * 60 * 1000 },
      )
      // Then confirm the USDC is actually spendable on-chain before fulfilling.
      await pollUntil(
        async () => {
          const balance = await config.getBalance()
          return balance > order.usdcBefore ? balance : null
        },
        { description: `USDC arriving on ${config.label}`, intervalMs: 15000, timeoutMs: 20 * 60 * 1000 },
      )
      order = orderStore.updateOrder(orderId, { bridgeStep: 'usdc_landed' })
      log(orderId, `USDC landed on ${config.label} wallet`)
    }

    if (order.mode === 'float' && !done('usdc_landed')) {
      // The customer's NIM stays in the receive wallet, accrued toward the next
      // batch swap that refills the float. Confirm the float actually holds
      // USDC before committing to fulfill from it.
      const floatUsdc = await config.getBalance()
      if (floatUsdc <= 0) {
        throw new Error(`USDC float on ${config.label} is empty — top it up to fulfill small orders`)
      }
      order = orderStore.updateOrder(orderId, { bridgeStep: 'usdc_landed', accruedLuna: order.receivedLuna })
      log(orderId, `Fulfilling from ${config.label} float ($${floatUsdc.toFixed(2)} on hand); ${order.receivedLuna / NIM_LUNA} NIM accrued`)
    }

    orderStore.updateOrder(orderId, { bridgeStep: 'fulfilling' })
    await config.fulfill(order)
    orderStore.updateOrder(orderId, { status: 'fulfilled', bridgeStep: 'done' })
  } catch (err) {
    orderStore.updateOrder(orderId, { status: 'failed', error: err.message })
    log(orderId, `FAILED: ${err.message}`)
    throw err
  }
}

module.exports = { runBridge, getBaseUsdcBalance, getSolanaUsdcBalance }
