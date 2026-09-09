const SIMPLESWAP_BASE = 'https://api.simpleswap.io'

// SimpleSwap authenticates with the api_key as a query param (not a header).
function withKey(path, params = {}) {
  const url = new URL(SIMPLESWAP_BASE + path)
  url.searchParams.set('api_key', process.env.SIMPLESWAP_API_KEY)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v))
  return url.toString()
}

async function request(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(`SimpleSwap ${method} ${res.status}: ${data.description || data.error || JSON.stringify(data)}`)
  }
  return data
}

// USDC ticker per fulfillment chain, in SimpleSwap's naming.
const USDC = { SOLANA: 'usdcspl', BASE: 'usdcbase' }

// Smallest NIM amount SimpleSwap will accept for a nim->USDC swap; below this
// the API rejects with a range error. Live value was ~57,263 NIM (~$22) at the
// time of writing — always confirmed against getRanges before creating a swap.
async function getMinNim(toTicker) {
  const r = await request('GET', withKey('/get_ranges', {
    fixed: false, currency_from: 'nim', currency_to: toTicker,
  }))
  return parseFloat(r.min)
}

// Creates a floating-rate swap: send NIM to the returned `address_from`, and
// SimpleSwap delivers USDC to `addressTo` on the target chain. Refunds go back
// to `refundAddress` if the swap can't complete. NIM has no destination tag.
async function createExchange({ toTicker, amountNim, addressTo, refundAddress }) {
  return request('POST', withKey('/create_exchange'), {
    fixed: false,
    currency_from: 'nim',
    currency_to: toTicker,
    amount: amountNim,
    address_to: addressTo,
    extra_id_to: '',
    user_refund_address: refundAddress,
    user_refund_extra_id: '',
  })
}

// status: waiting -> confirming -> exchanging -> sending -> finished
//         (or failed | refunded | expired)
async function getExchange(id) {
  return request('GET', withKey('/get_exchange', { id }))
}

module.exports = { USDC, getMinNim, createExchange, getExchange }
