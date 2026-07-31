const FASTSPOT_BASE = 'https://api.go.fastspot.io/fast/v1'

async function request(method, path, body) {
  const res = await fetch(`${FASTSPOT_BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json()
  if (!res.ok) {
    throw new Error(`Fastspot ${method} ${path} failed: ${JSON.stringify(data)}`)
  }
  return data
}

// Live-verified: NIM -> USDC_MATIC estimate, no API key needed.
function getEstimate(nimAmountLuna) {
  const nimAmount = (nimAmountLuna / 100000).toString()
  return request('POST', '/estimates', {
    from: { NIM: nimAmount },
    to: ['USDC_MATIC'],
    includedFees: 'required',
  })
}

// Creates a swap quote. Returns { id, status, expires, info }.
function createSwap(nimAmountLuna) {
  const nimAmount = (nimAmountLuna / 100000).toString()
  return request('POST', '/swaps', {
    from: { NIM: nimAmount },
    to: ['USDC_MATIC'],
    includedFees: 'required',
  })
}

// Confirms the quote and registers where the USDC_MATIC should go.
// Returns the swap with `contracts` — including contracts.NIM.htlc
// (address + data) needed to fund our side.
function confirmSwap(swapId, evmBeneficiaryAddress) {
  return request('POST', `/swaps/${swapId}`, {
    confirm: true,
    beneficiary: { USDC_MATIC: { address: evmBeneficiaryAddress } },
  })
}

function getSwapStatus(swapId) {
  return request('GET', `/swaps/${swapId}`)
}

module.exports = { getEstimate, createSwap, confirmSwap, getSwapStatus }
