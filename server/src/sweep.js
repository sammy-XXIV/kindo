const fs = require('fs')
const path = require('path')
const simpleswap = require('./simpleswapClient')
const { getCurrentBlockNumber, broadcastTransaction, RPC_URL } = require('./nimiqRpc')
const { buildSignedTransfer, MAIN_ALBATROSS } = require('./nimiqWallet')
const orderStore = require('./orderStore')

// Batch sweep: small orders are fulfilled from the Base USDC float while their
// NIM accrues in the receive wallet. Once the accrued NIM clears SimpleSwap's
// minimum, this swaps it to USDC on Base to refill the float — the other half
// of the float model. Runs automatically after float-mode fulfilments and on
// demand via scripts/sweep.js. Each sweep is persisted so a restart never
// re-sends NIM for an exchange that already has it.

const NIM_LUNA = 100000
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..')
const FILE = path.join(DATA_DIR, 'sweeps.json')
// Left in the receive wallet for transaction fees.
const RESERVE_NIM = Number(process.env.SWEEP_RESERVE_NIM || 5)

function readAll() {
  if (!fs.existsSync(FILE)) return []
  return JSON.parse(fs.readFileSync(FILE, 'utf8'))
}

function writeAll(list) {
  fs.writeFileSync(FILE, JSON.stringify(list, null, 2))
}

function upsert(record) {
  const list = readAll()
  const i = list.findIndex((s) => s.id === record.id)
  if (i >= 0) list[i] = { ...list[i], ...record }
  else list.push(record)
  writeAll(list)
  return record
}

const FINAL = ['finished', 'failed', 'refunded', 'expired']

// Direct RPC call — the client library's account method lags the node's
// current shape (same reason getRecentTransactions bypasses it).
async function getNimBalanceLuna(address) {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getAccountByAddress', params: [address] }),
  })
  const json = await res.json()
  if (json.error) throw new Error(`getAccountByAddress failed: ${json.error.message || JSON.stringify(json.error)}`)
  const account = json.result?.data ?? json.result
  return Number(account?.balance || 0)
}

// NIM in the wallet that belongs to swap-mode orders still waiting to be
// forwarded to their own exchange — never sweepable.
function reservedForOrdersLuna() {
  return [...orderStore.listByStatus('paid'), ...orderStore.listByStatus('bridging')]
    .filter((o) => o.mode !== 'float' && !o.depositTxHash && !o.demo)
    .reduce((sum, o) => sum + Number(o.receivedLuna || 0), 0)
}

// Refreshes any in-flight sweep from SimpleSwap; returns the still-pending one, if any.
async function refreshPending() {
  let pending = null
  for (const s of readAll()) {
    if (FINAL.includes(s.status)) continue
    const ex = await simpleswap.getExchange(s.id)
    const rec = upsert({ id: s.id, status: ex.status, receivedUsdc: ex.amount_to, updatedAt: Date.now() })
    if (!FINAL.includes(ex.status)) pending = rec
  }
  return pending
}

let inFlight = false

// Sweeps accrued NIM into the Base float if it clears the swap minimum.
// dryRun reports the plan without moving anything.
async function sweep({ dryRun = false, log = console.log } = {}) {
  if (inFlight) return { skipped: 'already_running' }
  inFlight = true
  try {
    const pending = await refreshPending()
    if (pending) return { skipped: 'sweep_pending', sweep: pending }

    const balanceLuna = await getNimBalanceLuna(process.env.NIMIQ_ADDRESS)
    const reservedLuna = reservedForOrdersLuna()
    const availableNim = (balanceLuna - reservedLuna) / NIM_LUNA - RESERVE_NIM
    const minNim = await simpleswap.getMinNim(simpleswap.USDC.BASE)
    const plan = {
      balanceNim: balanceLuna / NIM_LUNA,
      reservedForOrdersNim: reservedLuna / NIM_LUNA,
      availableNim: Math.max(0, availableNim),
      minNim,
    }
    if (availableNim < minNim) return { skipped: 'below_minimum', ...plan }
    if (dryRun) return { dryRun: true, ...plan }

    const amountNim = Math.floor(availableNim)
    const exchange = await simpleswap.createExchange({
      toTicker: simpleswap.USDC.BASE,
      amountNim,
      addressTo: process.env.EVM_ADDRESS,
      refundAddress: process.env.NIMIQ_ADDRESS,
    })
    const record = upsert({
      id: exchange.id,
      amountNim,
      expectedUsdc: exchange.amount_to,
      depositAddress: exchange.address_from,
      status: 'created',
      createdAt: Date.now(),
    })
    log(`[sweep ${exchange.id}] ${amountNim} NIM -> ~${exchange.amount_to} USDC on Base (deposit ${exchange.address_from})`)

    const validityStartHeight = await getCurrentBlockNumber()
    const rawTx = buildSignedTransfer({
      recipient: exchange.address_from,
      valueLuna: amountNim * NIM_LUNA,
      validityStartHeight,
      networkId: MAIN_ALBATROSS,
    })
    const depositTxHash = await broadcastTransaction(rawTx)
    upsert({ id: exchange.id, status: 'sent', depositTxHash, sentAt: Date.now() })
    log(`[sweep ${exchange.id}] NIM sent, tx ${depositTxHash}`)
    return { started: true, ...record, depositTxHash }
  } finally {
    inFlight = false
  }
}

// Fire-and-forget after a float-mode fulfilment; failures only get logged.
function maybeSweep(log = console.log) {
  sweep({ log })
    .then((r) => {
      if (r.started) log(`[sweep] started ${r.id}`)
    })
    .catch((err) => log(`[sweep] failed: ${err.message}`))
}

module.exports = { sweep, maybeSweep, refreshPending, readAll }
