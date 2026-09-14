const { Keypair } = require('@solana/web3.js')
const bs58 = require('bs58').default
const { createX402Client } = require('x402-solana/client')
const { fetchWithBasePayment } = require('./x402Base')
const { fetchWithSiwx } = require('./siwx')

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

// Pays Bitrefill (x402, USDC on Solana) and returns matching gift card /
// voucher brands — Amazon, Steam, Spar Nigeria, etc. Same catalog shape as
// topups, so the same product-detail + invoice flow fulfills them.
async function searchGiftCards(query) {
  const client = getClient()
  const url = `${BITREFILL_BASE}/gift-cards/search?q=${encodeURIComponent(query)}`
  const res = await client.fetch(url)
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Bitrefill gift card search failed (${res.status}): ${text}`)
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
      items: [
        {
          product_id: productId,
          package_value: packageValue,
          ...(refillInput ? { refill_input: refillInput } : {}),
        },
      ],
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Bitrefill invoice create failed (${res.status}): ${text}`)
  }
  return res.json()
}

// Pays the REAL face value of the invoice via x402 on Base from the USDC
// float. This is the step that actually delivers the top-up / gift card.
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

// Redemption codes are bound to the wallet that paid, so reading them means
// signing in as that wallet (SIWX, free) — the pay response only links here.
async function getInvoiceStatus(invoiceId) {
  const url = `${BITREFILL_BASE}/invoice/status?invoice_id=${encodeURIComponent(invoiceId)}`
  const res = await fetchWithSiwx(url)
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Bitrefill invoice status failed (${res.status}): ${text}`)
  }
  return res.json()
}

// Flattens an invoice's redemption info into receipt rows: one code/PIN set
// per delivered item. Empty for top-ups, which have nothing to redeem.
function extractCodes(status) {
  const rows = []
  for (const o of status?.redemption_info?.orders || []) {
    const r = o.redemption_info || {}
    if (r.code) rows.push({ label: 'Code', value: String(r.code) })
    if (r.pin) rows.push({ label: 'PIN', value: String(r.pin) })
    if (r.link || r.url) rows.push({ label: 'Redeem at', value: String(r.link || r.url) })
    if (r.expiration_date) rows.push({ label: 'Expires', value: String(r.expiration_date).slice(0, 10) })
  }
  return rows
}

module.exports = {
  searchTopups,
  searchGiftCards,
  getProductDetail,
  createInvoice,
  payInvoice,
  getInvoiceStatus,
  extractCodes,
}
