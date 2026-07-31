const { Keypair } = require('@solana/web3.js')
const bs58 = require('bs58').default ?? require('bs58')

const keypair = Keypair.generate()

console.log('Public address (fund this with USDC):')
console.log(keypair.publicKey.toBase58())
console.log('')
console.log('Secret key (goes in .env as SOLANA_SECRET_KEY, never share this):')
console.log(bs58.encode(keypair.secretKey))
