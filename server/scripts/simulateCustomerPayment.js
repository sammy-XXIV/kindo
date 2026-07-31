// One-off test helper: simulates a customer's Nimiq Pay payment. Nimiq
// rejects self-transfers ("sender same as recipient"), so this can't just
// send Kindo's wallet to itself — it relays through a throwaway keypair
// (funded from Kindo's own wallet) acting as the "customer", then pays
// Kindo's address for real with the orderId as memo, exactly like
// sendBasicTransactionWithData does from a real Nimiq Pay wallet.
require('dotenv').config()
const Nimiq = require('@nimiq/core')
const { loadKeyPair, MAIN_ALBATROSS } = require('../src/nimiqWallet')
const { getCurrentBlockNumber, broadcastTransaction, getBalanceLuna } = require('../src/nimiqRpc')

const API_BASE = 'http://localhost:3001'

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function waitForBalance(address, minLuna, { intervalMs = 5000, timeoutMs = 5 * 60 * 1000 } = {}) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const balance = await getBalanceLuna(address)
    if (balance >= minLuna) return balance
    await sleep(intervalMs)
  }
  throw new Error(`Timed out waiting for ${address} to reach ${minLuna} luna`)
}

async function main() {
  const productId = process.argv[2] || 'mtn-nigeria'
  const packageValue = process.argv[3] || '2000'
  const priceNim = parseFloat(process.argv[4])
  const phoneNumber = process.argv[5]
  if (!priceNim || !phoneNumber) {
    console.error('Usage: node simulateCustomerPayment.js <productId> <packageValue> <priceNim> <phoneNumber>')
    process.exit(1)
  }

  const orderId = `kindo-${Date.now()}`
  console.log('Registering order', orderId)
  const regRes = await fetch(`${API_BASE}/api/orders/mobile-data`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId, productId, packageValue, priceNim, phoneNumber }),
  })
  const order = await regRes.json()
  console.log('Registered:', order)

  const kindoKeyPair = loadKeyPair()
  const kindoAddress = kindoKeyPair.toAddress()

  const customerKeyPair = Nimiq.KeyPair.generate()
  const customerAddress = customerKeyPair.toAddress()
  console.log('Throwaway "customer" wallet:', customerAddress.toUserFriendlyAddress())

  const fundAmount = order.expectedLuna + 200 // cover their tiny relay fee
  console.log(`Funding throwaway wallet with ${fundAmount / 100000} NIM from Kindo's wallet...`)
  let validityStartHeight = await getCurrentBlockNumber()
  const fundTx = Nimiq.TransactionBuilder.newBasic(
    kindoAddress,
    customerAddress,
    BigInt(fundAmount),
    undefined,
    validityStartHeight,
    MAIN_ALBATROSS,
  )
  const fundProof = Nimiq.SignatureProof.singleSig(kindoKeyPair.publicKey, kindoKeyPair.sign(fundTx.serializeContent()))
  fundTx.proof = fundProof.serialize()
  const fundTxHash = await broadcastTransaction(Buffer.from(fundTx.serialize()).toString('hex'))
  console.log('Funding tx:', fundTxHash)

  console.log('Waiting for throwaway wallet to be funded...')
  await waitForBalance(customerAddress.toUserFriendlyAddress(), order.expectedLuna)
  console.log('Funded. Now paying Kindo with the order memo...')

  validityStartHeight = await getCurrentBlockNumber()
  const data = new Uint8Array(Buffer.from(orderId, 'utf8'))
  const payTx = Nimiq.TransactionBuilder.newBasicWithData(
    customerAddress,
    kindoAddress,
    data,
    BigInt(order.expectedLuna),
    undefined,
    validityStartHeight,
    MAIN_ALBATROSS,
  )
  const payProof = Nimiq.SignatureProof.singleSig(customerKeyPair.publicKey, customerKeyPair.sign(payTx.serializeContent()))
  payTx.proof = payProof.serialize()
  const payTxHash = await broadcastTransaction(Buffer.from(payTx.serialize()).toString('hex'))
  console.log('Payment tx:', payTxHash)
  console.log('Now watch:', `${API_BASE}/api/orders/${orderId}`)
}

main().catch((err) => {
  console.error('FAILED:', err)
  process.exit(1)
})
