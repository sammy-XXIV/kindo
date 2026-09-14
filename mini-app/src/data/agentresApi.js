// Real Resy venue search via the Kindo backend (AgentRes). In DEMO_MODE the
// backend can't book anyway, so the mock list stands in for the walkthrough.
import { isDemoMode } from '../lib/nimiqPay'
import { fetchRestaurants as fetchMockRestaurants } from './mockRestaurants'

export async function fetchRestaurants(query) {
  if (await isDemoMode()) return fetchMockRestaurants(query)

  const q = query.trim()
  if (!q) return []

  const res = await fetch(`/api/restaurants/search?q=${encodeURIComponent(q)}`)
  if (!res.ok) throw new Error(`Search failed (${res.status})`)
  const data = await res.json()
  return data.restaurants
}
