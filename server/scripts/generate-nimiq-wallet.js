const Nimiq = require('@nimiq/core')

const keyPair = Nimiq.KeyPair.generate()
const address = keyPair.toAddress()
const privateKeyHex = Buffer.from(keyPair.privateKey.serialize()).toString('hex')

console.log('Address (receive NIM here):')
console.log(address.toUserFriendlyAddress())
console.log('')
console.log('Private key hex (goes in .env as NIMIQ_PRIVATE_KEY):')
console.log(privateKeyHex)
