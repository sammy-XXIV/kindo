// Mock data standing in for a real Purch/BuyWith402 search call.
// Swap fetchProducts' body for a real API request once a funded
// x402-capable wallet exists to pay for search calls.
const PRODUCTS = [
  { id: 'earbuds', title: 'Wireless Earbuds', priceNim: 18.4, thumb: '🎧' },
  { id: 'charger', title: 'Portable Phone Charger', priceNim: 9.2, thumb: '🔌' },
  { id: 'lamp', title: 'Desk Lamp', priceNim: 24.75, thumb: '💡' },
  { id: 'grinder', title: 'Coffee Grinder', priceNim: 31.5, thumb: '☕' },
]

export function fetchProducts(query) {
  const q = query.trim().toLowerCase()
  const results = q
    ? PRODUCTS.filter((p) => p.title.toLowerCase().includes(q))
    : PRODUCTS

  return Promise.resolve(results)
}
