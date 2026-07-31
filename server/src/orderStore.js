const fs = require('fs')
const path = require('path')

// DATA_DIR points at Railway's persistent volume in production (mounted at
// /data) so orders survive redeploys/restarts — the container filesystem
// otherwise resets on every deploy. Falls back to the repo dir locally.
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..')
const FILE = path.join(DATA_DIR, 'orders.json')

function readAll() {
  if (!fs.existsSync(FILE)) return {}
  return JSON.parse(fs.readFileSync(FILE, 'utf8'))
}

function writeAll(orders) {
  fs.writeFileSync(FILE, JSON.stringify(orders, null, 2))
}

// status: pending_payment -> paid -> bridging -> fulfilled | failed
function createOrder(orderId, data) {
  const orders = readAll()
  orders[orderId] = { orderId, status: 'pending_payment', createdAt: Date.now(), log: [], ...data }
  writeAll(orders)
  return orders[orderId]
}

function getOrder(orderId) {
  return readAll()[orderId] || null
}

function updateOrder(orderId, patch) {
  const orders = readAll()
  if (!orders[orderId]) throw new Error(`Unknown order ${orderId}`)
  orders[orderId] = { ...orders[orderId], ...patch }
  writeAll(orders)
  return orders[orderId]
}

function appendLog(orderId, message) {
  const orders = readAll()
  if (!orders[orderId]) throw new Error(`Unknown order ${orderId}`)
  orders[orderId].log.push({ at: Date.now(), message })
  writeAll(orders)
  return orders[orderId]
}

function listByStatus(status) {
  return Object.values(readAll()).filter((o) => o.status === status)
}

module.exports = { createOrder, getOrder, updateOrder, appendLog, listByStatus }
