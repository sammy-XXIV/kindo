const { Keypair } = require('@solana/web3.js')
const bs58 = require('bs58').default
const { createX402Client } = require('x402-solana/client')

const PURCH_BASE = 'https://api.purch.xyz'

function getClient(maxUsdcAtomic = 50000) {
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
    amount: BigInt(maxUsdcAtomic),
  })
}

// Pays Purch (x402, USDC on Solana) and returns real product search results.
async function searchProducts(query) {
  const client = getClient()
  const url = `${PURCH_BASE}/x402/search?q=${encodeURIComponent(query)}`
  const res = await client.fetch(url)
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Purch search failed (${res.status}): ${body}`)
  }
  const data = await res.json()
  return data.products || []
}

// Places a real order (Amazon/Shopify) via Purch's dynamic-price checkout.
// maxUsd caps what we'll let the real x402 payment be, since the exact
// total (product + shipping) is only known once Purch prices this request.
async function buyProduct({ productUrl, shippingAddress, email, maxUsd }) {
  const client = getClient(Math.round(maxUsd * 1e6))
  const res = await client.fetch(`${PURCH_BASE}/x402/buy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ productUrl, shippingAddress, email }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Purch buy failed (${res.status}): ${body}`)
  }
  return res.json()
}

module.exports = { searchProducts, buyProduct }
