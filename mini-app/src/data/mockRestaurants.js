// Mock data standing in for a real AgentRes/Resy search call.
// Swap fetchRestaurants' body for a real API request once a funded
// x402-capable wallet exists to pay for search calls.
const RESTAURANTS = [
  { id: 'nobu', title: 'Nobu', subtitle: 'Japanese', priceNim: 0.03, thumb: '🍣' },
  { id: 'terra', title: 'Terra Kitchen', subtitle: 'Italian', priceNim: 0.03, thumb: '🍝' },
  { id: 'spice', title: 'Spice Route', subtitle: 'Indian', priceNim: 0.03, thumb: '🍛' },
]

export function fetchRestaurants(query) {
  const q = query.trim().toLowerCase()
  const results = q
    ? RESTAURANTS.filter(
        (r) => r.title.toLowerCase().includes(q) || r.subtitle.toLowerCase().includes(q),
      )
    : RESTAURANTS

  return Promise.resolve(results)
}
