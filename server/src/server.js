require('dotenv').config()
const path = require('path')
const express = require('express')
const { searchFlights } = require('./brijClient')
const { searchTopups, searchGiftCards, getProductDetail } = require('./bitrefillClient')
const { getNimUsdRate, usdToNimSync } = require('./nimPrice')
const { pollForPayments } = require('./nimiqRpc')
const { decodeRecipientData } = require('./paymentWatcher')
const orderStore = require('./orderStore')
const { runBridge } = require('./bridge')

const app = express()
app.use(express.json())
const PORT = process.env.PORT || 3001

// Railway terminates TLS at its proxy, so the real client IP arrives in
// X-Forwarded-For. Without this every request looks like the proxy's single IP
// and the limiter below would throttle all users as one bucket.
app.set('trust proxy', 1)

// Each search route makes a PAID x402 provider call, so an unthrottled endpoint
// is a way for anyone to drain the wallets. Small in-memory limiter — no extra
// dependency, and this runs as a single instance.
function rateLimit({ windowMs, max }) {
  const hits = new Map()
  return (req, res, next) => {
    const now = Date.now()
    if (hits.size > 5000) {
      for (const [k, v] of hits) if (now > v.resetAt) hits.delete(k)
    }
    const key = req.ip || req.socket.remoteAddress || 'unknown'
    const entry = hits.get(key)
    if (!entry || now > entry.resetAt) {
      hits.set(key, { count: 1, resetAt: now + windowMs })
      return next()
    }
    if (entry.count >= max) {
      res.set('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)))
      return res.status(429).json({ error: 'rate_limited' })
    }
    entry.count += 1
    return next()
  }
}

// Paid provider calls get a tight budget; the rest of the API a looser one.
app.use('/api/shop/search', rateLimit({ windowMs: 60000, max: 8 }))
app.use('/api/flights/search', rateLimit({ windowMs: 60000, max: 8 }))
app.use('/api/utilities/mobile-data/search', rateLimit({ windowMs: 60000, max: 8 }))
app.use('/api', rateLimit({ windowMs: 60000, max: 60 }))

const NIM_LUNA = 100000

// Shop = Bitrefill gift cards (Amazon, Steam, Spar Nigeria, …). Same paid
// search → product-detail → invoice chain as airtime, and fulfilled the same
// way from the Base USDC float, so a code is deliverable anywhere — unlike
// physical Amazon goods, which every provider ships to the US only.
app.get('/api/shop/search', async (req, res) => {
  const query = (req.query.q || '').toString().trim()
  if (!query) return res.json({ products: [] })

  try {
    // Resolve the NIM/USD rate before spending on the paid search, so a
    // price-fetch hiccup can't strand a search we already paid for.
    const rate = await getNimUsdRate()
    const q = query.toLowerCase()
    const brands = (await searchGiftCards(query))
      .filter((b) => b.in_stock !== false)
      // Bitrefill ranks by keyword fuzzily ("spar" surfaces a Thai wallet
      // first); put brands whose name actually contains the query on top.
      .sort((a, b) => Number(b.name?.toLowerCase().includes(q)) - Number(a.name?.toLowerCase().includes(q)))
      .slice(0, 4) // cap paid detail calls

    // Each detail call is an independent paid x402 request (~6s of Solana
    // settlement each), so fetch them concurrently rather than one by one.
    const details = await Promise.all(brands.map((b) => getProductDetail(b.slug)))

    const products = []
    brands.forEach((brand, i) => {
      const detail = details[i]
      const where = (brand.countries || []).slice(0, 3).join(', ')
      // Cheapest denominations first (Amazon lists $1000 at the top).
      const packages = [...(detail.packages || [])]
        .sort((a, b) => parseFloat(a.payment_price) - parseFloat(b.payment_price))
        .slice(0, 6)
      for (const pkg of packages) {
        // payment_price is already USD (payment_currency: "USD").
        const priceUsd = parseFloat(pkg.payment_price)
        if (!(priceUsd > 0)) continue
        products.push({
          id: `${brand.slug}-${pkg.package_value}`,
          title: `${pkg.package_currency} ${pkg.package_value}`,
          subtitle: where ? `${detail.name} · ${where}` : detail.name,
          thumb: (detail.name || '?').trim().charAt(0).toUpperCase(),
          priceNim: usdToNimSync(priceUsd, rate),
          priceUsd,
          rating: detail.ratings?.rating_value ?? null,
          reviewCount: detail.ratings?.rating_count ?? null,
          productUrl: detail.url || brand.product_url || null,
          productId: brand.slug,
          packageValue: pkg.package_value,
          // "none" for most store cards; "email" when the card is emailed
          // to a named recipient — decides whether refill_input is sent.
          recipientType: detail.recipient_type || 'none',
        })
      }
    })
    res.json({ products })
  } catch (err) {
    console.error('shop search failed:', err)
    res.status(502).json({ error: 'search_failed', message: err.message })
  }
})

function defaultDepartDate() {
  const d = new Date()
  d.setDate(d.getDate() + 30)
  return d.toISOString().slice(0, 10)
}

app.get('/api/flights/search', async (req, res) => {
  const query = (req.query.q || '').toString().trim()
  const match = query.match(/^([A-Za-z]{3})\s*(?:-|to|→)\s*([A-Za-z]{3})$/i)
  if (!match) return res.json({ flights: [] })

  try {
    const rate = await getNimUsdRate()
    const offers = await searchFlights({
      originIata: match[1].toUpperCase(),
      destinationIata: match[2].toUpperCase(),
      departDate: defaultDepartDate(),
    })
    const mapped = offers.map((o) => {
      const priceUsd = parseFloat(o.total_amount_decimal)
      return {
        id: o.id,
        title: `${o.origin_iata} → ${o.destination_iata}`,
        subtitle: o.owner_name,
        priceNim: usdToNimSync(priceUsd, rate),
        priceUsd,
        thumb: '✈️',
      }
    })
    res.json({ flights: mapped })
  } catch (err) {
    console.error('flight search failed:', err)
    res.status(502).json({ error: 'search_failed', message: err.message })
  }
})

app.get('/api/utilities/mobile-data/search', async (req, res) => {
  const query = (req.query.q || '').toString().trim()
  if (!query) return res.json({ topups: [] })

  try {
    const nimRate = await getNimUsdRate()
    const products = (await searchTopups(query)).slice(0, 2) // cap paid detail calls per search
    const details = await Promise.all(products.map((p) => getProductDetail(p.slug)))

    const items = []
    products.forEach((product, i) => {
      const detail = details[i]
      const packages = (detail.packages || []).slice(0, 12) // include the cheapest denominations
      for (const pkg of packages) {
        // payment_price is already USD — it is NOT a BTC amount.
        const priceUsd = parseFloat(pkg.payment_price)
        if (!(priceUsd > 0)) continue // skip packages with no usable price
        items.push({
          id: `${product.slug}-${pkg.package_value}`,
          title: `${detail.name} — ${pkg.package_currency} ${pkg.package_value}`,
          subtitle: detail.name,
          priceNim: usdToNimSync(priceUsd, nimRate),
          priceUsd,
          thumb: '📱',
          productId: product.slug,
          packageValue: pkg.package_value,
        })
      }
    })
    res.json({ topups: items })
  } catch (err) {
    console.error('mobile data search failed:', err)
    res.status(502).json({ error: 'search_failed', message: err.message })
  }
})

// Registers a mobile-data order before payment, so once the customer's NIM
// lands on-chain the backend knows exactly what to fulfill.
app.post('/api/orders/mobile-data', (req, res) => {
  const { orderId, productId, packageValue, priceNim, phoneNumber } = req.body || {}
  if (!orderId || !productId || !packageValue || !priceNim || !phoneNumber) {
    return res.status(400).json({ error: 'missing_fields' })
  }
  const expectedLuna = Math.round(priceNim * NIM_LUNA)
  const order = orderStore.createOrder(orderId, {
    type: 'mobile-data',
    item: { productId, packageValue },
    phoneNumber,
    expectedLuna,
  })
  res.json(order)
})

// Registers a Shop (gift card) order before payment — the same shape as a
// top-up, with an email as the recipient instead of a phone number.
app.post('/api/orders/shop', (req, res) => {
  const { orderId, productId, packageValue, priceNim, email, recipientType } = req.body || {}
  if (!orderId || !productId || !packageValue || !priceNim || !email) {
    return res.status(400).json({ error: 'missing_fields' })
  }
  const expectedLuna = Math.round(priceNim * NIM_LUNA)
  const order = orderStore.createOrder(orderId, {
    type: 'shop',
    item: { productId, packageValue, recipientType: recipientType || 'none' },
    email,
    expectedLuna,
  })
  res.json(order)
})

// Registers a flight order before payment (the passenger details BRIJ would
// need to issue a ticket). BRIJ is search-only today, so it's demo-fulfilled.
app.post('/api/orders/flights', (req, res) => {
  const { orderId, priceNim, offerId, route, passenger } = req.body || {}
  if (!orderId || !priceNim || !passenger?.givenName || !passenger?.familyName || !passenger?.email) {
    return res.status(400).json({ error: 'missing_fields' })
  }
  const expectedLuna = Math.round(priceNim * NIM_LUNA)
  const order = orderStore.createOrder(orderId, {
    type: 'flights',
    item: { offerId, route },
    passenger,
    expectedLuna,
  })
  res.json(order)
})

// Registers a restaurant reservation before payment. AgentRes is search-only
// today, so it's demo-fulfilled.
app.post('/api/orders/restaurant', (req, res) => {
  const { orderId, priceNim, venueId, venue, reservation } = req.body || {}
  if (!orderId || !priceNim || !reservation?.name || !reservation?.date || !reservation?.time) {
    return res.status(400).json({ error: 'missing_fields' })
  }
  const expectedLuna = Math.round(priceNim * NIM_LUNA)
  const order = orderStore.createOrder(orderId, {
    type: 'restaurant',
    item: { venueId, venue },
    reservation,
    expectedLuna,
  })
  res.json(order)
})

// Pulls anything code-like out of a provider's settlement response (gift
// card code, PIN, redemption link) without hard-coding one provider's shape.
// Capped so a pathological payload can't balloon the reply.
function pickCodes(value, path = '', out = []) {
  if (out.length >= 8 || value == null) return out
  if (Array.isArray(value)) {
    value.forEach((v, i) => pickCodes(v, path, out))
  } else if (typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) pickCodes(v, k, out)
  } else if (typeof value === 'string' && value && /code|pin|redeem|voucher|link|url/i.test(path)) {
    if (!/tx|hash|payment|refund/i.test(path)) out.push({ label: path, value })
  }
  return out
}

// Fulfillment details for the wallet that paid. The payment tx hash is the
// credential: the watcher records it when the NIM lands and only the payer's
// wallet ever saw it, so a guessable orderId alone reveals nothing — until
// the payment is seen, this is just the public status.
app.get('/api/orders/:orderId/delivery', (req, res) => {
  const order = orderStore.getOrder(req.params.orderId)
  if (!order || !order.orderId) return res.status(404).json({ error: 'not_found' })
  const tx = String(req.query.tx || '').toLowerCase()
  if (!order.paymentTxHash) return res.json({ status: order.status, bridgeStep: null })
  if (!tx || tx !== String(order.paymentTxHash).toLowerCase()) {
    return res.status(403).json({ error: 'forbidden' })
  }
  res.json({
    status: order.status,
    bridgeStep: order.bridgeStep || null,
    error: order.error || null,
    recipientType: order.item?.recipientType || null,
    codes: order.status === 'fulfilled' ? pickCodes(order.delivery) : [],
  })
})

// Order IDs are timestamp-based and therefore guessable, so this returns status
// only — never the shipping address, email, phone, or passenger/reservation
// details stored on the order.
app.get('/api/orders/:orderId', (req, res) => {
  const order = orderStore.getOrder(req.params.orderId)
  if (!order || !order.orderId) return res.status(404).json({ error: 'not_found' })
  res.json({
    orderId: order.orderId,
    type: order.type,
    status: order.status,
    bridgeStep: order.bridgeStep || null,
    demo: Boolean(order.demo),
    error: order.error || null,
  })
})

// Lets the frontend know whether to take the real Nimiq Pay path or the
// no-funds demo path.
app.get('/api/config', (req, res) => {
  res.json({ demoMode: process.env.DEMO_MODE === 'true' })
})

// Watches Kindo's own Nimiq address for incoming payments and matches them
// to pending orders by the memo (orderId) sendBasicTransactionWithData sent.
function startPaymentWatcher() {
  pollForPayments(process.env.NIMIQ_ADDRESS, {
    intervalMs: 5000,
    onPayment: (tx) => {
      const orderId = decodeRecipientData(tx.recipientData)
      const order = orderStore.getOrder(orderId)
      if (!order || order.status !== 'pending_payment') return
      if (tx.value < order.expectedLuna) {
        orderStore.updateOrder(orderId, { status: 'failed', error: 'underpaid' })
        return
      }
      orderStore.updateOrder(orderId, { status: 'paid', receivedLuna: tx.value, paymentTxHash: tx.hash })
      runBridge(orderId).catch((err) => console.error(`bridge failed for ${orderId}:`, err))
    },
    onError: (err) => console.error('payment watcher error:', err),
  })
}

// DEMO_MODE: skip the on-chain watcher and expose an endpoint that simulates
// the customer's NIM payment landing, so the whole flow can be triggered
// without a real payment or any funds in the wallet.
if (process.env.DEMO_MODE === 'true') {
  app.post('/api/demo/pay/:orderId', (req, res) => {
    const order = orderStore.getOrder(req.params.orderId)
    if (!order) return res.status(404).json({ error: 'not_found' })
    if (order.status !== 'pending_payment') {
      return res.status(409).json({ error: 'not_pending', status: order.status })
    }
    orderStore.updateOrder(order.orderId, { status: 'paid', receivedLuna: order.expectedLuna, paymentTxHash: 'DEMO' })
    runBridge(order.orderId).catch((err) => console.error(`demo bridge failed for ${order.orderId}:`, err))
    res.json({ ok: true, orderId: order.orderId })
  })
  console.log('DEMO_MODE on — chain watcher disabled; POST /api/demo/pay/:orderId simulates payment')
} else {
  startPaymentWatcher()
}

// Serves the built mini-app so the API and frontend are one Railway service
// on one origin — the frontend's relative /api/... calls just work, same as
// the Vite dev-server proxy does locally.
const frontendDist = path.join(__dirname, '..', '..', 'mini-app', 'dist')
app.use(express.static(frontendDist))
app.use((req, res) => {
  res.sendFile(path.join(frontendDist, 'index.html'))
})

app.listen(PORT, () => {
  console.log(`Kindo API listening on http://localhost:${PORT}`)
})
