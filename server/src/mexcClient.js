const crypto = require('crypto')

const BASE = 'https://api.mexc.com'

function sign(params) {
  const query = new URLSearchParams(params).toString()
  const signature = crypto.createHmac('sha256', process.env.MEXC_SECRET_KEY).update(query).digest('hex')
  return `${query}&signature=${signature}`
}

async function signedRequest(method, path, params = {}) {
  const query = sign({ ...params, timestamp: Date.now() })
  const res = await fetch(`${BASE}${path}?${query}`, {
    method,
    headers: { 'X-MEXC-APIKEY': process.env.MEXC_ACCESS_KEY },
  })
  const data = await res.json()
  if (!res.ok) throw new Error(`MEXC ${method} ${path} failed: ${JSON.stringify(data)}`)
  return data
}

function getBalance(asset) {
  return signedRequest('GET', '/api/v3/account').then(
    (data) => data.balances.find((b) => b.asset === asset) || { asset, free: '0', locked: '0' },
  )
}

function getDepositHistory(coin) {
  return signedRequest('GET', '/api/v3/capital/deposit/hisrec', { coin })
}

// Market-sell `quantity` of `baseAsset` into `quoteAsset` (e.g. sell NIM for USDT).
function marketSell(symbol, quantity) {
  return signedRequest('POST', '/api/v3/order', { symbol, side: 'SELL', type: 'MARKET', quantity })
}

// Market-buy `baseAsset` by spending `quoteOrderQty` of `quoteAsset` (e.g. spend USDT to buy USDC).
function marketBuy(symbol, quoteOrderQty) {
  return signedRequest('POST', '/api/v3/order', { symbol, side: 'BUY', type: 'MARKET', quoteOrderQty })
}

function withdraw({ coin, network, address, amount }) {
  return signedRequest('POST', '/api/v3/capital/withdraw/apply', { coin, network, address, amount })
}

function getWithdrawHistory(coin) {
  return signedRequest('GET', '/api/v3/capital/withdraw/history', { coin })
}

module.exports = { getBalance, getDepositHistory, marketSell, marketBuy, withdraw, getWithdrawHistory }
