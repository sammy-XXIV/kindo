import { getDeviceId } from './nimiqPay'

// Receipts live on the device: each paid order is recorded here with the
// payment tx hash, which is also the credential the backend needs to show
// that order's status and any gift-card code later on. Nothing here is
// secret beyond the hash, and nothing leaves the phone.
const KEY = 'kindo.orders'
const MAX = 50

function read() {
  try {
    const raw = localStorage.getItem(KEY)
    const list = raw ? JSON.parse(raw) : []
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

function write(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)))
  } catch {
    /* storage unavailable (private mode, quota) — history is best-effort */
  }
}

export function recordOrder(entry) {
  const stamped = { ...entry, at: Date.now() }
  const list = read().filter((o) => o.orderId !== entry.orderId)
  write([stamped, ...list])
  // Also file it under Nimiq Pay's device id so it survives a reinstall.
  getDeviceId().then((deviceId) => {
    if (!deviceId) return
    fetch('/api/receipts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId, receipt: stamped }),
    }).catch(() => {})
  })
}

export function listOrders() {
  return read()
}

// Local receipts merged with the ones filed under this device's id — so a
// cleared webview or a reinstall still shows everything this phone bought.
export async function syncOrders() {
  const deviceId = await getDeviceId()
  if (!deviceId) return read()
  try {
    const res = await fetch(`/api/receipts?device=${encodeURIComponent(deviceId)}`)
    if (!res.ok) return read()
    const { receipts } = await res.json()
    const byId = new Map()
    for (const r of [...read(), ...(receipts || [])]) if (!byId.has(r.orderId)) byId.set(r.orderId, r)
    const merged = [...byId.values()].sort((a, b) => (b.at || 0) - (a.at || 0))
    write(merged)
    return merged
  } catch {
    return read()
  }
}

// Screen persistence, so a refresh lands back where the user was.
const SCREEN_KEY = 'kindo.screen'

export function loadScreen() {
  try {
    return sessionStorage.getItem(SCREEN_KEY) || null
  } catch {
    return null
  }
}

export function saveScreen(screen) {
  try {
    sessionStorage.setItem(SCREEN_KEY, screen)
  } catch {
    /* ignore */
  }
}
