const { getAccountByAddress, getBlockNumber, getTransactionsByAddress, pushTransaction } = require('nimiq-rpc-client-ts/http')

const RPC_URL = process.env.NIMIQ_RPC_URL || 'https://rpc.nimiqwatch.com'

function opts() {
  return { url: new URL(RPC_URL) }
}

async function getBalanceLuna(address) {
  const [success, error, result] = await getAccountByAddress({ address }, opts())
  if (!success) throw new Error(`getAccountByAddress failed: ${error}`)
  return result.balance
}

async function getCurrentBlockNumber() {
  const [success, error, result] = await getBlockNumber(opts())
  if (!success) throw new Error(`getBlockNumber failed: ${error}`)
  return result
}

async function getRecentTransactions(address, max = 10) {
  const [success, error, result] = await getTransactionsByAddress({ address, max }, opts())
  if (!success) throw new Error(`getTransactionsByAddress failed: ${error}`)
  return result
}

// sendRawTransaction on this RPC accepts and hashes malformed/invalid
// transactions without ever relaying them (confirmed: it "succeeds" even on
// a self-transfer the network actually rejects, and nothing ever reaches
// the mempool). pushTransaction does real mempool validation and relay.
async function broadcastTransaction(rawTransaction) {
  const [success, error, txHash] = await pushTransaction({ transaction: rawTransaction }, opts())
  if (!success) throw new Error(`pushTransaction failed: ${error}`)
  return txHash
}

// The RPC provider's WebSocket endpoint isn't available (confirmed 404 on
// both networks), so payment detection polls getTransactionsByAddress
// instead. Calls onPayment once per new incoming transaction it hasn't
// seen before. Returns a function to stop polling.
function pollForPayments(address, { onPayment, onError, intervalMs = 5000 }) {
  const seen = new Set()
  let stopped = false

  async function tick() {
    if (stopped) return
    try {
      const txs = await getRecentTransactions(address, 20)
      for (const tx of txs) {
        if (tx.to !== address) continue
        if (seen.has(tx.hash)) continue
        seen.add(tx.hash)
        onPayment(tx)
      }
    } catch (err) {
      onError?.(err)
    } finally {
      if (!stopped) setTimeout(tick, intervalMs)
    }
  }

  tick()
  return () => {
    stopped = true
  }
}

module.exports = {
  getBalanceLuna,
  getCurrentBlockNumber,
  getRecentTransactions,
  broadcastTransaction,
  pollForPayments,
  RPC_URL,
}
