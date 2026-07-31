const { createPublicClient, http } = require('viem')
const { base } = require('viem/chains')
const { getCurrentBlockNumber, broadcastTransaction } = require('./nimiqRpc')
const { buildSignedTransfer, MAIN_ALBATROSS } = require('./nimiqWallet')
const mexc = require('./mexcClient')
const { createInvoice, payInvoice } = require('./bitrefillClient')
const orderStore = require('./orderStore')

const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
const NIM_LUNA = 100000

// Ordered so `stepIndex('sent_to_mexc') < stepIndex('nim_credited')` etc. —
// lets a retried/resumed run skip whatever already completed.
const STEPS = [
  'sending_to_mexc',
  'sent_to_mexc',
  'nim_credited',
  'sold_to_usdt',
  'bought_usdc',
  'withdrawn',
  'usdc_landed',
  'invoice_created',
  'done',
]

function stepIndex(step) {
  return step ? STEPS.indexOf(step) : -1
}

const baseClient = createPublicClient({ chain: base, transport: http() })

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

function floorTo(value, decimals) {
  const factor = 10 ** decimals
  return Math.floor(value * factor) / factor
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

// Runs the full NIM -> MEXC -> USDC -> Bitrefill pipeline for one paid order.
// Every step updates the order's persisted state, so progress survives a
// server restart, is visible to the status endpoint, and a re-invocation
// (after a transient failure) resumes from bridgeStep instead of redoing
// steps that already spent real money.
async function runMobileDataBridge(orderId) {
  let order = orderStore.getOrder(orderId)
  if (!order) throw new Error(`Unknown order ${orderId}`)

  const done = (step) => stepIndex(order.bridgeStep) >= stepIndex(step)

  try {
    if (!done('sent_to_mexc')) {
      orderStore.updateOrder(orderId, { status: 'bridging', bridgeStep: 'sending_to_mexc' })
      const nimAmount = order.receivedLuna / NIM_LUNA
      log(orderId, `Sending ${nimAmount} NIM to MEXC deposit address`)

      const validityStartHeight = await getCurrentBlockNumber()
      const rawTx = buildSignedTransfer({
        recipient: process.env.MEXC_NIM_DEPOSIT_ADDRESS,
        valueLuna: order.receivedLuna,
        validityStartHeight,
        networkId: MAIN_ALBATROSS,
      })
      const depositTxHash = await broadcastTransaction(rawTx)
      order = orderStore.updateOrder(orderId, { bridgeStep: 'sent_to_mexc', depositTxHash })
      log(orderId, `Sent, tx hash ${depositTxHash}`)
    }

    if (!done('nim_credited')) {
      await pollUntil(
        async () => {
          const history = await mexc.getDepositHistory('NIM')
          return history.find((d) => d.txId === order.depositTxHash && d.status === 5)
        },
        { description: `MEXC crediting deposit ${order.depositTxHash}`, intervalMs: 15000, timeoutMs: 30 * 60 * 1000 },
      )
      order = orderStore.updateOrder(orderId, { bridgeStep: 'nim_credited' })
      log(orderId, 'MEXC credited the NIM deposit')
    }

    if (!done('sold_to_usdt')) {
      const nimBalance = await mexc.getBalance('NIM')
      const sellQty = floorTo(parseFloat(nimBalance.free), 2)
      await mexc.marketSell('NIMUSDT', sellQty)
      order = orderStore.updateOrder(orderId, { bridgeStep: 'sold_to_usdt' })
      log(orderId, `Sold ${sellQty} NIM for USDT`)
    }

    if (!done('bought_usdc')) {
      const usdtBalance = await pollUntil(
        async () => {
          const b = await mexc.getBalance('USDT')
          return parseFloat(b.free) > 0 ? b : null
        },
        { description: 'USDT balance after sell', intervalMs: 3000, timeoutMs: 60000 },
      )
      const buyQty = floorTo(parseFloat(usdtBalance.free), 5)
      await mexc.marketBuy('USDCUSDT', buyQty)
      order = orderStore.updateOrder(orderId, { bridgeStep: 'bought_usdc' })
      log(orderId, `Spent ${buyQty} USDT buying USDC`)
    }

    if (!done('withdrawn')) {
      const usdcBalance = await pollUntil(
        async () => {
          const b = await mexc.getBalance('USDC')
          return parseFloat(b.free) >= 1 ? b : null
        },
        { description: 'USDC balance after buy', intervalMs: 3000, timeoutMs: 60000 },
      )
      const withdrawAmount = floorTo(parseFloat(usdcBalance.free), 2)
      await mexc.withdraw({
        coin: 'USDC',
        network: 'BASE',
        address: process.env.EVM_ADDRESS,
        amount: withdrawAmount,
      })
      order = orderStore.updateOrder(orderId, { bridgeStep: 'withdrawn', withdrawAmount })
      log(orderId, `Withdrew ${withdrawAmount} USDC to ${process.env.EVM_ADDRESS} on Base`)
    }

    if (!done('usdc_landed')) {
      const balanceBefore = await getBaseUsdcBalance(process.env.EVM_ADDRESS)
      await pollUntil(
        async () => {
          const balance = await getBaseUsdcBalance(process.env.EVM_ADDRESS)
          return balance > balanceBefore ? balance : null
        },
        { description: 'USDC arriving on Base', intervalMs: 15000, timeoutMs: 20 * 60 * 1000 },
      )
      order = orderStore.updateOrder(orderId, { bridgeStep: 'usdc_landed' })
      log(orderId, 'USDC landed on Base wallet')
    }

    if (!done('invoice_created')) {
      const invoice = await createInvoice({
        productId: order.item.productId,
        packageValue: order.item.packageValue,
        refillInput: order.phoneNumber,
      })
      order = orderStore.updateOrder(orderId, { bridgeStep: 'invoice_created', invoiceId: invoice.invoice_id })
      log(orderId, `Created Bitrefill invoice ${invoice.invoice_id} for $${invoice.price_usd}`)
    }

    await payInvoice(order.invoiceId)
    orderStore.updateOrder(orderId, { status: 'fulfilled', bridgeStep: 'done' })
    log(orderId, 'Paid invoice — top-up delivered')
  } catch (err) {
    orderStore.updateOrder(orderId, { status: 'failed', error: err.message })
    log(orderId, `FAILED: ${err.message}`)
    throw err
  }
}

module.exports = { runMobileDataBridge, getBaseUsdcBalance }
