const { privateKeyToAccount } = require('viem/accounts')
const { createSiweMessage } = require('viem/siwe')

// Sign-In-With-X (CAIP-122) for x402 identity endpoints: the server's 402
// carries a `sign-in-with-x` extension with a one-time nonce; we sign the
// SIWE-formatted message with the Base wallet (EIP-191) and retry with the
// payload in the SIGN-IN-WITH-X header. Costs nothing. Used to read gift
// card codes from Bitrefill, which binds them to the wallet that paid.

const CHAIN = 'eip155:8453'

async function fetchWithSiwx(url, init = {}) {
  const initial = await fetch(url, init)
  if (initial.status !== 402) return initial

  const header = initial.headers.get('payment-required')
  if (!header) throw new Error('Missing Payment-Required header')
  const required = JSON.parse(Buffer.from(header, 'base64').toString('utf8'))
  const ext = required.extensions?.['sign-in-with-x']
  if (!ext?.info) throw new Error('Endpoint offers no sign-in-with-x')

  const account = privateKeyToAccount(process.env.EVM_PRIVATE_KEY)
  const info = ext.info
  const fields = {
    domain: info.domain,
    address: account.address,
    statement: info.statement,
    uri: info.uri,
    version: info.version || '1',
    chainId: Number(CHAIN.split(':')[1]),
    nonce: info.nonce,
    issuedAt: new Date(info.issuedAt),
    ...(info.expirationTime ? { expirationTime: new Date(info.expirationTime) } : {}),
    ...(info.resources ? { resources: info.resources } : {}),
  }
  const message = createSiweMessage(fields)
  const signature = await account.signMessage({ message })

  const payload = {
    domain: info.domain,
    address: account.address,
    statement: info.statement,
    uri: info.uri,
    version: info.version || '1',
    chainId: CHAIN,
    type: 'eip191',
    nonce: info.nonce,
    issuedAt: info.issuedAt,
    ...(info.expirationTime ? { expirationTime: info.expirationTime } : {}),
    ...(info.resources ? { resources: info.resources } : {}),
    signature,
  }
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64')
  return fetch(url, { ...init, headers: { ...(init.headers || {}), 'SIGN-IN-WITH-X': encoded } })
}

module.exports = { fetchWithSiwx }
