const fs = require('fs')
const path = require('path')

// Per-device receipt index, keyed by Nimiq Pay's device identifier. Same
// file-backed shape as orders.json, on the same volume.
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..')
const FILE = path.join(DATA_DIR, 'receipts.json')
const MAX_PER_DEVICE = 100

function readAll() {
  if (!fs.existsSync(FILE)) return {}
  return JSON.parse(fs.readFileSync(FILE, 'utf8'))
}

function writeAll(all) {
  fs.writeFileSync(FILE, JSON.stringify(all, null, 2))
}

function add(deviceId, entry) {
  const all = readAll()
  const list = (Object.hasOwn(all, deviceId) ? all[deviceId] : []).filter((r) => r.orderId !== entry.orderId)
  all[deviceId] = [entry, ...list].slice(0, MAX_PER_DEVICE)
  writeAll(all)
}

function list(deviceId) {
  const all = readAll()
  return Object.hasOwn(all, deviceId) ? all[deviceId] : []
}

module.exports = { add, list }
