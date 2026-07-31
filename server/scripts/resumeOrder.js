// Manually resumes a bridge run for an order stuck at 'failed' after a
// transient error — bridgeStep-based skipping means already-completed
// (money-spent) steps won't be redone.
require('dotenv').config()
const orderStore = require('../src/orderStore')
const { runMobileDataBridge } = require('../src/bridge')

const orderId = process.argv[2]
if (!orderId) {
  console.error('Usage: node resumeOrder.js <orderId>')
  process.exit(1)
}

orderStore.updateOrder(orderId, { status: 'bridging', error: undefined })
runMobileDataBridge(orderId)
  .then(() => console.log('Done'))
  .catch((err) => {
    console.error('FAILED:', err.message)
    process.exit(1)
  })
