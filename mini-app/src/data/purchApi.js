// Real Purch (x402, paid per search) product search via the Kindo backend.
export async function fetchProducts(query) {
  const q = query.trim()
  if (!q) return []

  const res = await fetch(`/api/shop/search?q=${encodeURIComponent(q)}`)
  if (!res.ok) throw new Error(`Search failed (${res.status})`)
  const data = await res.json()
  return data.products
}
