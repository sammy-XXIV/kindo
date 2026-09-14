// Sweep accrued NIM from the receive wallet into the Base USDC float.
//   node scripts/sweep.js            run (no-op below the swap minimum)
//   node scripts/sweep.js --dry-run  show the plan only
//   node scripts/sweep.js --status   refresh and list past sweeps
require('dotenv').config()
const { sweep, refreshPending, readAll } = require('../src/sweep')

const arg = process.argv[2]
;(async () => {
  if (arg === '--status') {
    await refreshPending()
    for (const s of readAll()) {
      console.log(`${s.id}  ${s.status.padEnd(9)} ${s.amountNim} NIM -> ${s.receivedUsdc || s.expectedUsdc} USDC  ${new Date(s.createdAt).toISOString()}`)
    }
    return
  }
  const r = await sweep({ dryRun: arg === '--dry-run' })
  console.log(JSON.stringify(r, null, 2))
})().catch((e) => {
  console.error('FAILED:', e.message)
  process.exit(1)
})
