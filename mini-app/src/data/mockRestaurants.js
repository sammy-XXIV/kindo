// Mock data standing in for a real AgentRes/Resy search call.
// Swap fetchRestaurants' body for a real API request once a funded
// x402-capable wallet exists to pay for search calls.
const RESTAURANTS = [
  { id: 'nobu', title: 'Nobu', subtitle: 'Omakase · $$$$', priceNim: 0.05, thumb: 'N', rating: 4.9 },
  { id: 'elan', title: 'Élan', subtitle: 'Modern French · $$$$', priceNim: 0.05, thumb: 'E', rating: 4.8 },
  { id: 'terra', title: 'Terra', subtitle: 'Coastal Italian · $$$', priceNim: 0.03, thumb: 'T', rating: 4.7 },
  { id: 'kaido', title: 'Kaidō', subtitle: 'Sushi Counter · $$$', priceNim: 0.04, thumb: 'K', rating: 4.9 },
  { id: 'spice', title: 'Spice Route', subtitle: 'Modern Indian · $$$', priceNim: 0.04, thumb: 'S', rating: 4.8 },
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
