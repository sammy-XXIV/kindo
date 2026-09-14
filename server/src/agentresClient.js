const { fetchWithBasePayment } = require('./x402Base')

const AGENTRES_BASE = 'https://agentres.dev'

// AgentRes (Resy bookings over x402 v2). Identity endpoints cost $0 and are
// authenticated by a zero-value x402 proof from the Base wallet — the wallet
// IS the account. Booking is $0.01, paid from the Base USDC float. Every
// call except account setup needs a Resy account linked to that wallet once
// via email OTP (server/_link_resy.js).

async function call(path, init) {
  const res = await fetchWithBasePayment(`${AGENTRES_BASE}${path}`, init)
  const text = await res.text()
  let data
  try {
    data = JSON.parse(text)
  } catch {
    data = { raw: text }
  }
  if (!res.ok) {
    const detail = data?.error?.message || data?.error?.code || text
    const err = new Error(`AgentRes ${path.split('?')[0]} failed (${res.status}): ${detail}`)
    err.code = data?.error?.code
    throw err
  }
  return data
}

function post(path, body) {
  return call(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

// Wallet-bound account; idempotent. The email becomes the account's Resy
// contact and must match the one used for link-resy.
function createAccount(email) {
  return post('/api/account', email ? { email } : {})
}

function getMe() {
  return call('/api/me')
}

// Step 1 (no code): AgentRes emails an OTP to the Resy account.
// Step 2 (with code): completes the link. Same email both times.
function linkResy(email, code) {
  return post('/api/link-resy', code ? { em_address: email, code } : { em_address: email })
}

// Real Resy venue matches. Requires a linked Resy account.
async function searchRestaurants(query, city = 'nyc') {
  const data = await call(`/api/search?query=${encodeURIComponent(query)}&city=${encodeURIComponent(city)}`)
  return data.results || []
}

// Fresh slots for a venue/day/party. Each slot's config_id is what /api/book
// takes, and they expire — always fetch right before booking.
async function getAvailability({ venueId, partySize, day }) {
  const qs = `venue_id=${encodeURIComponent(venueId)}&party_size=${partySize}&day=${day}`
  return call(`/api/availability?${qs}`)
}

// Books the slot ($0.01). Returns { success, resy_token, reservation_id, ... }.
function bookTable({ venueId, configId, partySize, day }) {
  return post('/api/book', { venue_id: String(venueId), config_id: configId, party_size: partySize, day })
}

async function listReservations(type = 'upcoming') {
  const data = await call(`/api/reservations?type=${type}`)
  return data.reservations || []
}

function cancelReservation(resyToken) {
  return post('/api/cancel', { resy_token: resyToken })
}

module.exports = {
  createAccount,
  getMe,
  linkResy,
  searchRestaurants,
  getAvailability,
  bookTable,
  listReservations,
  cancelReservation,
}
