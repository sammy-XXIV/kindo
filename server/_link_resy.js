// One-time setup for Dining: link a Resy account to Kindo's Base wallet so
// AgentRes can search venues and book tables on its behalf. Costs nothing.
//
//   node _link_resy.js you@resy-email.com          -> emails a 6-digit code
//   node _link_resy.js you@resy-email.com 123456   -> completes the link
//
// The Resy account needs a card on file (added at resy.com) — bookings
// require one even though Kindo pays AgentRes's $0.01 fee itself.
require('dotenv').config()
const { createAccount, linkResy, getMe } = require('./src/agentresClient')

const [email, code] = process.argv.slice(2)
if (!email) {
  console.error('usage: node _link_resy.js <resy-email> [otp-code]')
  process.exit(1)
}

;(async () => {
  const me = await getMe().catch(() => null)
  if (me?.resy_linked) {
    console.log(`Already linked (${me.email}) since ${me.resy_linked_at}. Nothing to do.`)
    return
  }
  if (!code) {
    await createAccount(email)
    const r = await linkResy(email)
    console.log(`${r.step}: ${r.message}`)
    console.log(`\nNow run:  node _link_resy.js ${email} <code-from-email>`)
    return
  }
  const r = await linkResy(email, code)
  console.log(`${r.step}: ${r.message}`)
  const after = await getMe()
  console.log('resy_linked:', after.resy_linked, '| wallet:', after.wallet_address)
})().catch((e) => {
  console.error('FAILED:', e.message)
  process.exit(1)
})
