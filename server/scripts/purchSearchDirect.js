require('dotenv').config()
const { Keypair } = require('@solana/web3.js')
const bs58 = require('bs58').default
const { createX402Client } = require('x402-solana/client')

const secretKey = process.env.SOLANA_SECRET_KEY
if (!secretKey) throw new Error('SOLANA_SECRET_KEY not set')

const keypair = Keypair.fromSecretKey(bs58.decode(secretKey))

const wallet = {
  address: keypair.publicKey.toBase58(),
  signTransaction: async (tx) => {
    tx.sign([keypair])
    return tx
  },
}

const client = createX402Client({
  wallet,
  network: 'solana',
  amount: BigInt(50000), // safety cap: $0.05 USDC
  verbose: true,
})

async function main() {
  const query = process.argv[2] || 'wireless earbuds'
  const url = `https://api.purch.xyz/x402/search?q=${encodeURIComponent(query)}`
  console.log('Requesting:', url)
  console.log('Paying from wallet:', wallet.address)

  const res = await client.fetch(url)
  console.log('Final status:', res.status)
  const text = await res.text()
  console.log('Body:', text)
}

main().catch((err) => {
  console.error('FAILED:', err)
  process.exit(1)
})
