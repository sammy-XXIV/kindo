import { init } from '@nimiq/mini-app-sdk'

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

export function isInsideNimiqPay() {
  return typeof window !== 'undefined' && Boolean(window.nimiqPay)
}
