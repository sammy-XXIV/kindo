// Mock data standing in for a real BRIJ flight search call.
// Swap fetchFlights' body for a real API request once a funded
// x402-capable wallet exists to pay for search calls.
const FLIGHTS = [
  { id: 'ba-lhr', title: 'LOS → LHR', subtitle: 'British Airways', priceNim: 142.0, thumb: '✈️' },
  { id: 'ke-jfk', title: 'LOS → JFK', subtitle: 'Kenya Airways', priceNim: 210.5, thumb: '🛫' },
  { id: 'ek-dxb', title: 'LOS → DXB', subtitle: 'Emirates', priceNim: 178.25, thumb: '🛬' },
]

export function fetchFlights(query) {
  const q = query.trim().toLowerCase()
  const results = q
    ? FLIGHTS.filter(
        (f) => f.title.toLowerCase().includes(q) || f.subtitle.toLowerCase().includes(q),
      )
    : FLIGHTS

  return Promise.resolve(results)
}
