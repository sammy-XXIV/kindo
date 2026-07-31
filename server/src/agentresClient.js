const { fetchWithBasePayment } = require('./x402Base')

const AGENTRES_SEARCH_URL = 'https://agentres.dev/api/search'

// Pays AgentRes (x402 v2, USDC on Base — this search route is priced at $0)
// and returns real Resy venue matches.
async function searchRestaurants(query) {
  const url = `${AGENTRES_SEARCH_URL}?query=${encodeURIComponent(query)}`
  const res = await fetchWithBasePayment(url)
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`AgentRes search failed (${res.status}): ${text}`)
  }
  const data = await res.json()
  return data.results || []
}

module.exports = { searchRestaurants }
