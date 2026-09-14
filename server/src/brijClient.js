const { Keypair } = require('@solana/web3.js')
const bs58 = require('bs58').default
const { createX402Client } = require('x402-solana/client')

const BRIJ_BASE = 'https://travel.brij.fi'
const BRIJ_SEARCH_URL = `${BRIJ_BASE}/air/search`

// maxUsdcAtomic caps what one call may pay: $0.15 covers search ($0.10) and
// intent creation ($0.10); booking passes the intent's exact escrow amount.
function getClient(maxUsdcAtomic = 150000) {
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

async function readJson(res, label) {
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`BRIJ ${label} failed (${res.status}): ${text}`)
  }
  return res.json()
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

// Locks a searched offer into an escrow-backed booking intent ($0.10). The
// intent says exactly how much USDC (atomic) the escrow needs and by when.
// Nothing is paid to the airline yet.
async function createIntent(offerId) {
  const client = getClient()
  const res = await client.fetch(`${BRIJ_BASE}/air/intents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ offer_id: offerId, funding_wallet: process.env.SOLANA_ADDRESS }),
  })
  const data = await readJson(res, 'intent')
  return data.intent
}

// Funds the escrow and requests the ticket. The x402 challenge for this call
// is the escrow itself (payTo = escrow address, amount = expected escrow), so
// the client cap is set to exactly that — it can't pay a penny more.
async function bookIntent(intent, passenger) {
  const client = getClient(Number(intent.expected_escrow_amount))
  const res = await client.fetch(`${BRIJ_BASE}/air/intents/${encodeURIComponent(intent.id)}/book`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      passengers: [
        {
          title: passenger.title,
          given_name: passenger.givenName,
          family_name: passenger.familyName,
          born_on: passenger.bornOn,
          gender: passenger.gender,
          email: passenger.email,
          // E.164: leading '+', digits only.
          phone_number: String(passenger.phoneNumber || '').replace(/[^\d+]/g, ''),
        },
      ],
    }),
  })
  return readJson(res, 'book')
}

// Airline order status once the booking worker has run.
async function getFlightOrder(orderId) {
  const res = await fetch(`${BRIJ_BASE}/air/orders/${encodeURIComponent(orderId)}`)
  return readJson(res, 'order')
}

module.exports = { searchFlights, createIntent, bookIntent, getFlightOrder }
