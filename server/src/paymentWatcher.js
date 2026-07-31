const { pollForPayments } = require('./nimiqRpc')

// Nimiq's recipientData for a "basic transaction with data" is the raw
// message bytes, hex-encoded by the RPC. Falls back to treating it as
// plain text if hex-decoding doesn't look right, since this hasn't been
// verified yet against a real on-chain transaction (no funded wallet to
// test with at the time this was written).
function decodeRecipientData(hex) {
  if (!hex) return ''
  try {
    const decoded = Buffer.from(hex, 'hex').toString('utf8')
    // A successful hex->utf8 decode of non-hex text produces garbage
    // (replacement chars); guard against that.
    if (!decoded.includes('�')) return decoded
  } catch {
    // fall through
  }
  return hex
}

// Watches for a payment matching a specific orderId (sent as the memo via
// sendBasicTransactionWithData) and a minimum expected amount in Luna.
// Calls onMatch once, then stops watching for this order.
function watchForOrderPayment({ address, orderId, minValueLuna, onMatch, onError, timeoutMs = 15 * 60 * 1000 }) {
  let stopped = false

  const stopPolling = pollForPayments(address, {
    intervalMs: 5000,
    onPayment: (tx) => {
      if (stopped) return
      const memo = decodeRecipientData(tx.recipientData)
      if (memo !== orderId) return
      if (tx.value < minValueLuna) {
        onError?.(new Error(`Payment for ${orderId} underpaid: got ${tx.value}, expected ${minValueLuna}`))
        return
      }
      stopped = true
      stopPolling()
      onMatch(tx)
    },
    onError,
  })

  const timeout = setTimeout(() => {
    if (stopped) return
    stopped = true
    stopPolling()
    onError?.(new Error(`Timed out waiting for payment for order ${orderId}`))
  }, timeoutMs)

  return () => {
    stopped = true
    clearTimeout(timeout)
    stopPolling()
  }
}

module.exports = { watchForOrderPayment, decodeRecipientData }
