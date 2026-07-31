const { Wallet } = require('ethers')

const wallet = Wallet.createRandom()

console.log('Address (receives USDC on Polygon from Fastspot):')
console.log(wallet.address)
console.log('')
console.log('Private key (goes in .env as EVM_PRIVATE_KEY):')
console.log(wallet.privateKey)
