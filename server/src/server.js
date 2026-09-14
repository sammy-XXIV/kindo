require('dotenv').config()
const path = require('path')
const express = require('express')
const { searchFlights } = require('./brijClient')
const { searchRestaurants } = require('./agentresClient')
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
app.use('/api/shop/packages', rateLimit({ windowMs: 60000, max: 12 }))
app.use('/api/restaurants/search', rateLimit({ windowMs: 60000, max: 8 }))
app.use('/api', rateLimit({ windowMs: 60000, max: 60 }))

const NIM_LUNA = 100000

// Shop = Bitrefill gift cards (Amazon, Steam, Spar Nigeria, …), fulfilled the
// same way as airtime from the Base USDC float, so a code is deliverable
// anywhere — unlike physical Amazon goods, which every provider ships to the
// US only. Two paid steps: this search lists brands ($0.02); the amounts for
// one brand are fetched only when it's tapped (/api/shop/packages, $0.01),
// rather than paying for detail on every brand up front.
app.get('/api/shop/search', async (req, res) => {
  const query = (req.query.q || '').toString().trim()
  if (!query) return res.json({ brands: [] })

  try {
    const q = query.toLowerCase()
    const brands = (await searchGiftCards(query))
      .filter((b) => b.in_stock !== false)
      // Bitrefill ranks by keyword fuzzily ("spar" surfaces a Thai wallet
      // first); put brands whose name actually contains the query on top.
      .sort((a, b) => Number(b.name?.toLowerCase().includes(q)) - Number(a.name?.toLowerCase().includes(q)))
      .slice(0, 12)
      .map((b) => ({
        slug: b.slug,
        name: b.name,
        countries: b.countries || [],
        currency: b.currency || null,
        category: (b.categories || [])[0] || null,
        productUrl: b.product_url || null,
      }))
    res.json({ brands })
  } catch (err) {
    console.error('shop search failed:', err)
    res.status(502).json({ error: 'search_failed', message: err.message })
  }
})

// The purchasable amounts for one gift card brand, cheapest first.
app.get('/api/shop/packages', async (req, res) => {
  const slug = (req.query.slug || '').toString().trim()
  if (!slug || !/^[a-z0-9-_]+$/i.test(slug)) return res.status(400).json({ error: 'bad_slug' })

  try {
    const [rate, detail] = await Promise.all([getNimUsdRate(), getProductDetail(slug)])
    const packages = [...(detail.packages || [])]
      // payment_price is already USD (payment_currency: "USD").
      .map((pkg) => ({ pkg, priceUsd: parseFloat(pkg.payment_price) }))
      .filter(({ priceUsd }) => priceUsd > 0)
      .sort((a, b) => a.priceUsd - b.priceUsd)
      .slice(0, 8)
      .map(({ pkg, priceUsd }) => ({
        packageValue: pkg.package_value,
        currency: pkg.package_currency,
        priceUsd,
        priceNim: usdToNimSync(priceUsd, rate),
      }))
    res.json({
      name: detail.name,
      rating: detail.ratings?.rating_value ?? null,
      reviewCount: detail.ratings?.rating_count ?? null,
      productUrl: detail.url || null,
      // "none" for most store cards; "email" when the card is emailed to a
      // named recipient — decides whether refill_input is sent at fulfillment.
      recipientType: detail.recipient_type || 'none',
      packages,
    })
  } catch (err) {
    console.error('shop packages failed:', err)
    res.status(502).json({ error: 'packages_failed', message: err.message })
  }
})

// Real Resy venues via AgentRes ($0 identity call, but it hits Resy). A table
// costs the $0.01 booking fee; the customer pays that in NIM. Needs the Resy
// account linked to the Base wallet (server/_link_resy.js) — until then this
// reports unavailable rather than showing venues that can't be booked.
const RESERVATION_FEE_USD = 0.01

app.get('/api/restaurants/search', async (req, res) => {
  const query = (req.query.q || '').toString().trim()
  if (!query) return res.json({ restaurants: [] })
  const city = (req.query.city || 'nyc').toString().toLowerCase().replace(/[^a-z-]/g, '')

  try {
    const [rate, venues] = await Promise.all([getNimUsdRate(), searchRestaurants(query, city)])
    const restaurants = venues.slice(0, 12).map((v) => ({
      id: String(v.venue_id),
      title: v.name,
      subtitle: [v.neighborhood, (v.cuisine || []).slice(0, 2).join(', ')].filter(Boolean).join(' · '),
      thumb: (v.name || '?').trim().charAt(0).toUpperCase(),
      rating: v.rating ?? null,
      priceUsd: RESERVATION_FEE_USD,
      priceNim: usdToNimSync(RESERVATION_FEE_USD, rate),
    }))
    res.json({ restaurants })
  } catch (err) {
    console.error('restaurant search failed:', err)
    const unavailable = err.code === 'NO_LINKED_ACCOUNT'
    res.status(502).json({
      error: unavailable ? 'not_linked' : 'search_failed',
      message: unavailable ? 'Dining is not set up yet — link a Resy account.' : err.message,
    })
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

// Registers a restaurant reservation before payment; the bridge re-checks
// availability for that day/party and books the nearest slot on AgentRes.
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
