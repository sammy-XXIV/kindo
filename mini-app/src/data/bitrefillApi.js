// Real mobile top-up/airtime search via the Kindo backend (Bitrefill, x402, paid per search).
export async function fetchTopups(query) {
  const q = query.trim()
  if (!q) return []

  const res = await fetch(`/api/utilities/mobile-data/search?q=${encodeURIComponent(q)}`)
  if (!res.ok) throw new Error(`Search failed (${res.status})`)
  const data = await res.json()

  // Backend titles look like "Verizon USA — USD 5". Lead the card with the
  // denomination (what actually differs between rows), keep the carrier as the
  // subtitle, and use a carrier-initial monogram instead of the phone emoji.
  return (data.topups || []).map((t) => {
    const parts = String(t.title).split(' — ')
    const carrier = parts.length > 1 ? parts[0] : t.subtitle || t.title
    const denom = parts.length > 1 ? parts.slice(1).join(' — ') : t.title
    return {
      ...t,
      title: denom,
      subtitle: carrier,
      thumb: (carrier || '?').trim().charAt(0).toUpperCase(),
    }
  })
}
