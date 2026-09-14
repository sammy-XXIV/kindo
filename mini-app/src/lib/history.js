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
  const list = read().filter((o) => o.orderId !== entry.orderId)
  write([{ ...entry, at: Date.now() }, ...list])
}

export function listOrders() {
  return read()
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
