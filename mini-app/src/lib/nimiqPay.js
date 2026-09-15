import { init, getHostLanguage, requestDeviceIdentifier } from '@nimiq/mini-app-sdk'

// Kindo's receiving address — where all NIM payments land before the
// backend detects them, bridges to USDC, and fulfills the order.
export const KINDO_RECEIVE_ADDRESS = 'NQ48 VUP6 42E2 X803 TQAU LX1V 1UJV LUBF RUX7'

const NIM_TO_LUNA = 100000

let nimiqPromise = null

// init() only resolves once Nimiq Pay has injected its provider — this
// hangs forever outside the real Nimiq Pay app, which is expected: the
// mini app has to be opened via nimiqpay://miniapp?url=... on a phone.
// A timeout turns that hang into a clear error for anyone testing in a
// regular browser instead of silently freezing the UI.
function getNimiq() {
  if (!nimiqPromise) {
    nimiqPromise = Promise.race([
      init(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('NIMIQ_PAY_NOT_DETECTED')), 4000),
      ),
    ]).catch((err) => {
      nimiqPromise = null // allow retrying instead of caching the failure forever
      throw err
    })
  }
  return nimiqPromise
}

// amountNim: how much NIM the user is being asked to pay.
// orderId: attached as a text memo so the backend can match this
// payment to the right order instead of guessing by amount alone.
export async function payWithNim({ amountNim, orderId }) {
  const nimiq = await getNimiq()
  const value = Math.round(amountNim * NIM_TO_LUNA)

  const txHash = await nimiq.sendBasicTransactionWithData({
    recipient: KINDO_RECEIVE_ADDRESS,
    value,
    data: orderId,
  })

  return txHash
}

// The wallet's own account — shown on Home and used to check the balance
// before asking the user to pay. null outside Nimiq Pay or if declined.
let accountPromise = null
export function getAccount() {
  if (!accountPromise) {
    accountPromise = getNimiq()
      .then((nimiq) => nimiq.listAccounts())
      .then((r) => (Array.isArray(r) && r[0]) || null)
      .catch(() => {
        accountPromise = null
        return null
      })
  }
  return accountPromise
}

// NIM balance for an address, read through the Kindo backend (Albatross RPC).
export async function getBalanceNim(address) {
  const res = await fetch(`/api/nim/balance?address=${encodeURIComponent(address)}`)
  if (!res.ok) throw new Error('balance_failed')
  return (await res.json()).nim
}

// Language chosen in Nimiq Pay (ISO 639-1); falls back to the browser's.
export function hostLocale() {
  return getHostLanguage() || (typeof navigator !== 'undefined' ? navigator.language : 'en')
}

// Pseudonymous per-device id from Nimiq Pay. Lets receipts follow the device
// across reinstalls. First call shows a consent prompt with the reason; null
// if declined or not inside Nimiq Pay.
let deviceIdPromise = null
export function getDeviceId() {
  if (!deviceIdPromise) {
    deviceIdPromise = requestDeviceIdentifier({ reason: 'Keep your receipts and gift card codes on this device' })
      .catch(() => {
        deviceIdPromise = null
        return null
      })
  }
  return deviceIdPromise
}

export function isInsideNimiqPay() {
  return typeof window !== 'undefined' && Boolean(window.nimiqPay)
}

// Whether the backend is running in DEMO_MODE (no real funds). Cached after
// the first check so the confirm screen can decide which pay path to take.
let demoModePromise = null
export function isDemoMode() {
  if (!demoModePromise) {
    demoModePromise = fetch('/api/config')
      .then((r) => r.json())
      .then((c) => Boolean(c.demoMode))
      .catch(() => false)
  }
  return demoModePromise
}

// Demo stand-in for payWithNim: tells the backend to simulate the NIM payment
// for this order, so the full flow runs without a real Nimiq Pay transaction.
export async function payDemo(orderId) {
  const res = await fetch(`/api/demo/pay/${orderId}`, { method: 'POST' })
  if (!res.ok) throw new Error('demo_pay_failed')
  return 'DEMO'
}
