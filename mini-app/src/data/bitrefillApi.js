// Real mobile top-up/airtime search via the Kindo backend (Bitrefill, x402, paid per search).
export async function fetchTopups(query) {
  const q = query.trim()
  if (!q) return []

  const res = await fetch(`/api/utilities/mobile-data/search?q=${encodeURIComponent(q)}`)
  if (!res.ok) throw new Error(`Search failed (${res.status})`)
  const data = await res.json()
  return data.topups
}
