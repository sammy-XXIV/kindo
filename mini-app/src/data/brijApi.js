// Real BRIJ flight search via the Kindo backend (x402, paid per search).
// Expects "ORIGIN-DEST" IATA codes, e.g. "LOS-LHR".
export async function fetchFlights(query) {
  const q = query.trim()
  if (!q) return []

  const res = await fetch(`/api/flights/search?q=${encodeURIComponent(q)}`)
  if (!res.ok) throw new Error(`Search failed (${res.status})`)
  const data = await res.json()
  return data.flights
}
