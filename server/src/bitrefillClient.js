const { Keypair } = require('@solana/web3.js')
const bs58 = require('bs58').default
const { createX402Client } = require('x402-solana/client')
const { fetchWithBasePayment } = require('./x402Base')

const BITREFILL_BASE = 'https://api.bitrefill.com/x402'

function getClient() {
  const secretKey = process.env.SOLANA_SECRET_KEY
  if (!secretKey) throw new Error('SOLANA_SECRET_KEY not set')
  const keypair = Keypair.fromSecretKey(bs58.decode(secretKey))

  return createX402Client({
    wallet: {
      address: keypair.publicKey.toBase58(),
      signTransaction: async (tx) => {
        tx.sign([keypair])
        return tx
      },
    },
    network: 'solana',
    amount: BigInt(10000), // safety cap: $0.01 USDC per call
  })
}

// Pays Bitrefill (x402, USDC on Solana) and returns matching carriers/products.
async function searchTopups(query) {
  const client = getClient()
  const url = `${BITREFILL_BASE}/topups/search?q=${encodeURIComponent(query)}`
  const res = await client.fetch(url)
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Bitrefill search failed (${res.status}): ${text}`)
  }
  const data = await res.json()
  return data.products || []
}

// Pays Bitrefill for a product's real denominations, pricing, and recipient requirements.
async function getProductDetail(slug) {
  const client = getClient()
  const url = `${BITREFILL_BASE}/products/detail?slug=${encodeURIComponent(slug)}`
  const res = await client.fetch(url)
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Bitrefill product detail failed (${res.status}): ${text}`)
  }
  return res.json()
}

// Pays the small invoice-creation fee (Solana) and price-locks the real
// top-up purchase. Returns { invoice_id, price_usdc, price_usd, ... }.
async function createInvoice({ productId, packageValue, refillInput }) {
  const client = getClient()
  const url = `${BITREFILL_BASE}/invoice/create`
  const res = await client.fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: [{ product_id: productId, package_value: packageValue, refill_input: refillInput }],
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Bitrefill invoice create failed (${res.status}): ${text}`)
  }
  return res.json()
}

// Pays the REAL face value of the invoice via x402 on Base, using the USDC
// bridged in from MEXC. This is the step that actually delivers the top-up.
async function payInvoice(invoiceId) {
  const url = `${BITREFILL_BASE}/invoice/pay`
  const res = await fetchWithBasePayment(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ invoice_id: invoiceId }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Bitrefill invoice pay failed (${res.status}): ${text}`)
  }
  return res.json()
}

module.exports = { searchTopups, getProductDetail, createInvoice, payInvoice }
