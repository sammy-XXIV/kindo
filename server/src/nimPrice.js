const CACHE_MS = 60_000
const cache = {} // coingeckoId -> { rate, at } — kept even once stale, as a fallback if CoinGecko is unreachable/rate-limited.

// Live USD rate for a CoinGecko asset id, cached for a minute to avoid rate limits.
// Falls back to the last known rate (however stale) if the live fetch fails,
// since a slightly-off price beats discarding a search we already paid for.
async function getUsdRate(coingeckoId) {
  const cached = cache[coingeckoId]
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.rate

  try {
    const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${coingeckoId}&vs_currencies=usd`)
    if (!res.ok) throw new Error(`CoinGecko price fetch failed (${res.status})`)
    const data = await res.json()
    const rate = data[coingeckoId]?.usd
    if (!rate) throw new Error(`CoinGecko response missing ${coingeckoId}/USD rate`)

    cache[coingeckoId] = { rate, at: Date.now() }
    return rate
  } catch (err) {
    if (cached) return cached.rate
    throw err
  }
}

function getNimUsdRate() {
  return getUsdRate('nimiq-2')
}

function getBtcUsdRate() {
  return getUsdRate('bitcoin')
}

function usdToNimSync(usd, rate) {
  return usd / rate
}

module.exports = { getNimUsdRate, getBtcUsdRate, usdToNimSync }
