// Mock data standing in for real weather / FX / translation x402 calls.
// Swap each function's body for a real API request once a funded
// x402-capable wallet exists to pay for these lookups.
const UTILITY_FEE_NIM = 0.05

const MOCK_WEATHER = {
  lagos: { condition: 'Clear', tempC: 29 },
  london: { condition: 'Cloudy', tempC: 17 },
  'new york': { condition: 'Rain', tempC: 21 },
  tokyo: { condition: 'Sunny', tempC: 26 },
}

const MOCK_RATES_USD = { USD: 1, EUR: 0.92, GBP: 0.79, NGN: 1550, JPY: 157 }

export function getWeather(city) {
  const key = city.trim().toLowerCase()
  const hit = MOCK_WEATHER[key]
  const data = hit ?? { condition: 'Clear', tempC: 22 }
  return Promise.resolve({
    label: city.trim() || 'Unknown city',
    result: `${data.condition}, ${data.tempC}°C`,
    fee: UTILITY_FEE_NIM,
  })
}

export function convertCurrency(amount, from, to) {
  const fromRate = MOCK_RATES_USD[from.toUpperCase()] ?? 1
  const toRate = MOCK_RATES_USD[to.toUpperCase()] ?? 1
  const converted = (Number(amount) || 0) * (toRate / fromRate)
  return Promise.resolve({
    label: `${amount} ${from.toUpperCase()} → ${to.toUpperCase()}`,
    result: `${converted.toFixed(2)} ${to.toUpperCase()}`,
    fee: UTILITY_FEE_NIM,
  })
}

export function translateText(text) {
  return Promise.resolve({
    label: text.trim() || 'Nothing entered',
    result: 'Translation engine not wired up yet — this is a placeholder result.',
    fee: UTILITY_FEE_NIM,
  })
}
