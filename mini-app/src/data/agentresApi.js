// Real Resy venue search via the Kindo backend (AgentRes).
export async function fetchRestaurants(query) {
  const q = query.trim()
  if (!q) return []

  const res = await fetch(`/api/restaurants/search?q=${encodeURIComponent(q)}`)
  if (!res.ok) throw new Error(`Search failed (${res.status})`)
  const data = await res.json()
  return data.restaurants
}
