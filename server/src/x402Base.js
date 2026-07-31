const crypto = require('crypto')
const { privateKeyToAccount } = require('viem/accounts')

// Generic x402 v2 client for EVM/Base "exact" scheme payments, signed by hand.
// There's no off-the-shelf v2 client for EVM (x402-fetch only speaks v1, and
// x402-solana covers Solana only), so this builds the EIP-3009
// TransferWithAuthorization directly and sends it via the PAYMENT-SIGNATURE
// header the v2 protocol uses on every chain. Reused by any Base-network x402
// endpoint (AgentRes search, Bitrefill invoice/pay, ...).

async function signPayment(accepted, resourceUrl) {
  const account = privateKeyToAccount(process.env.EVM_PRIVATE_KEY)
  const chainId = Number(accepted.network.split(':')[1]) // eip155:8453 -> 8453
  const validAfter = 0n
  const validBefore = BigInt(Math.floor(Date.now() / 1000) + accepted.maxTimeoutSeconds)
  const nonce = `0x${crypto.randomBytes(32).toString('hex')}`

  const authorization = {
    from: account.address,
    to: accepted.payTo,
    value: accepted.amount,
    validAfter: validAfter.toString(),
    validBefore: validBefore.toString(),
    nonce,
  }

  const signature = await account.signTypedData({
    domain: {
      name: accepted.extra.name,
      version: accepted.extra.version,
      chainId,
      verifyingContract: accepted.asset,
    },
    types: {
      TransferWithAuthorization: [
        { name: 'from', type: 'address' },
        { name: 'to', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'validAfter', type: 'uint256' },
        { name: 'validBefore', type: 'uint256' },
        { name: 'nonce', type: 'bytes32' },
      ],
    },
    primaryType: 'TransferWithAuthorization',
    message: {
      from: authorization.from,
      to: authorization.to,
      value: BigInt(authorization.value),
      validAfter,
      validBefore,
      nonce,
    },
  })

  const paymentPayload = {
    x402Version: 2,
    resource: { url: resourceUrl, description: '', mimeType: 'application/json' },
    accepted,
    payload: { signature, authorization },
  }

  return Buffer.from(JSON.stringify(paymentPayload)).toString('base64')
}

// Fetches `url` (GET) or posts `body` to it, paying via x402 v2 on Base if challenged.
async function fetchWithBasePayment(url, init = {}) {
  const initial = await fetch(url, init)
  if (initial.status !== 402) return initial

  const header = initial.headers.get('payment-required')
  if (!header) throw new Error('Missing Payment-Required header')
  const paymentRequired = JSON.parse(Buffer.from(header, 'base64').toString('utf8'))
  const accepted = paymentRequired.accepts.find((a) => a.network.startsWith('eip155:'))
  if (!accepted) throw new Error('No EVM payment option offered')

  const paymentSignature = await signPayment(accepted, url)

  return fetch(url, { ...init, headers: { ...(init.headers || {}), 'PAYMENT-SIGNATURE': paymentSignature } })
}

module.exports = { fetchWithBasePayment }
