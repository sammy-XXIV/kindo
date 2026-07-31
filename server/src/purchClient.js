const { Keypair } = require('@solana/web3.js')
const bs58 = require('bs58').default
const { createX402Client } = require('x402-solana/client')

const PURCH_BASE = 'https://api.purch.xyz'

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
    amount: BigInt(50000), // safety cap: $0.05 USDC per call
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

module.exports = { searchProducts }
