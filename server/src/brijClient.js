const { Keypair } = require('@solana/web3.js')
const bs58 = require('bs58').default
const { createX402Client } = require('x402-solana/client')

const BRIJ_SEARCH_URL = 'https://travel.brij.fi/air/search'

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
    amount: BigInt(150000), // safety cap: $0.15 USDC per call (BRIJ search is $0.10)
  })
}

// Pays BRIJ (x402, USDC on Solana) and returns real flight offers.
async function searchFlights({ originIata, destinationIata, departDate, adults = 1, returnDate }) {
  const client = getClient()
  const body = {
    origin_iata: originIata,
    destination_iata: destinationIata,
    depart_date: departDate,
    adults,
    ...(returnDate ? { return_date: returnDate } : {}),
  }

  const res = await client.fetch(BRIJ_SEARCH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`BRIJ search failed (${res.status}): ${text}`)
  }
  const data = await res.json()
  // BRIJ's docs example shows offers at the top level, but the live API
  // actually nests them under `search.offers`.
  return data.search?.offers || []
}

module.exports = { searchFlights }
