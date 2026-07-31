require('dotenv').config()
const path = require('path')
const express = require('express')
const { searchProducts } = require('./purchClient')
const { searchFlights } = require('./brijClient')
const { searchTopups, getProductDetail } = require('./bitrefillClient')
const { getNimUsdRate, getBtcUsdRate, usdToNimSync } = require('./nimPrice')
const { pollForPayments } = require('./nimiqRpc')
const { decodeRecipientData } = require('./paymentWatcher')
const orderStore = require('./orderStore')
const { runBridge } = require('./bridge')

const app = express()
app.use(express.json())
const PORT = process.env.PORT || 3001

// MEXC's own USDC withdrawal minimums, with a buffer for trading
// spread/slippage across the NIM->USDT->USDC hops: Base is 1 USDC + 0.1
// fee (cheap network, small orders work); Solana is 20 USDC + 0.18 fee
// (Purch/BRIJ only accept Solana, so only bigger orders clear it).
const MIN_FULFILLABLE_USD_BASE = 1.5
const MIN_FULFILLABLE_USD_SOLANA = 22
const NIM_LUNA = 100000

app.get('/api/shop/search', async (req, res) => {
  const query = (req.query.q || '').toString().trim()
  if (!query) return res.json({ products: [] })

  try {
    // Resolve the NIM/USD rate before spending on the paid Purch search,
    // so a price-fetch hiccup can't strand a search we already paid for.
    const rate = await getNimUsdRate()
    const products = await searchProducts(query)
    const mapped = products
      // Real checkout only supports Amazon (via ASIN/productUrl) for now,
      // and only orders that clear MEXC's Solana withdrawal floor can
      // actually be fulfilled in real time.
      .filter((p) => p.source === 'amazon' && p.price >= MIN_FULFILLABLE_USD_SOLANA)
      .map((p) => ({
        id: p.id,
        title: p.title,
        priceNim: usdToNimSync(p.price, rate),
        priceUsd: p.price,
        imageUrl: p.imageUrl || null,
        subtitle: p.vendor || p.source,
        productUrl: p.productUrl,
        rating: p.rating ?? null,
        reviewCount: p.reviewCount ?? null,
      }))
    res.json({ products: mapped })
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
    const [nimRate, btcRate] = await Promise.all([getNimUsdRate(), getBtcUsdRate()])
    const products = (await searchTopups(query)).slice(0, 2) // cap paid detail calls per search

    const items = []
    for (const product of products) {
      const detail = await getProductDetail(product.slug)
      const packages = (detail.packages || []).slice(3, 9) // mid-range denominations
      for (const pkg of packages) {
        const priceUsd = parseFloat(pkg.payment_price) * btcRate
        if (priceUsd < MIN_FULFILLABLE_USD_BASE) continue // below MEXC's real-time withdrawal floor
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
    }
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

// Registers a Shop order before payment — Purch's checkout needs the
// product, real shipping address, and email once the customer's NIM lands.
app.post('/api/orders/shop', (req, res) => {
  const { orderId, productUrl, priceNim, priceUsd, shippingAddress, email } = req.body || {}
  if (!orderId || !productUrl || !priceNim || !priceUsd || !shippingAddress || !email) {
    return res.status(400).json({ error: 'missing_fields' })
  }
  const required = ['name', 'line1', 'city', 'state', 'zip', 'country', 'phone']
  if (required.some((f) => !shippingAddress[f])) {
    return res.status(400).json({ error: 'missing_shipping_fields' })
  }
  const expectedLuna = Math.round(priceNim * NIM_LUNA)
  const order = orderStore.createOrder(orderId, {
    type: 'shop',
    item: { productUrl, priceUsd },
    shippingAddress: {
      name: shippingAddress.name,
      line1: shippingAddress.line1,
      line2: shippingAddress.line2 || undefined,
      city: shippingAddress.city,
      state: shippingAddress.state,
      postalCode: shippingAddress.zip,
      country: shippingAddress.country,
      phone: shippingAddress.phone,
    },
    email,
    expectedLuna,
  })
  res.json(order)
})

app.get('/api/orders/:orderId', (req, res) => {
  const order = orderStore.getOrder(req.params.orderId)
  if (!order) return res.status(404).json({ error: 'not_found' })
  res.json(order)
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

startPaymentWatcher()

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
