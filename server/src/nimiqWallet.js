const Nimiq = require('@nimiq/core')

const TEST_ALBATROSS = 5
const MAIN_ALBATROSS = 24

function loadKeyPair() {
  const privKeyHex = process.env.NIMIQ_PRIVATE_KEY
  if (!privKeyHex) throw new Error('NIMIQ_PRIVATE_KEY not set')
  const privKey = Nimiq.PrivateKey.deserialize(
    new Nimiq.SerialBuffer(Buffer.from(privKeyHex, 'hex')),
  )
  return Nimiq.KeyPair.derive(privKey)
}

// Builds and signs a basic NIM transfer, returning the raw hex ready for
// sendRawTransaction. luna = smallest NIM unit (1 NIM = 100000 luna).
function buildSignedTransfer({ recipient, valueLuna, validityStartHeight, networkId = MAIN_ALBATROSS }) {
  const keyPair = loadKeyPair()
  const sender = keyPair.toAddress()
  const recipientAddress = Nimiq.Address.fromUserFriendlyAddress(recipient)

  const tx = Nimiq.TransactionBuilder.newBasic(
    sender,
    recipientAddress,
    BigInt(valueLuna),
    undefined,
    validityStartHeight,
    networkId,
  )

  const proof = Nimiq.SignatureProof.singleSig(
    keyPair.publicKey,
    keyPair.sign(tx.serializeContent()),
  )
  tx.proof = proof.serialize()

  return Buffer.from(tx.serialize()).toString('hex')
}

// Builds and signs a transaction that FUNDS a Fastspot atomic-swap HTLC —
// this is the "creation" transaction, distinct from a plain transfer.
// htlcAddress/htlcDataHex come directly from Fastspot's POST /swaps/{id}
// confirm response (contracts.NIM.htlc.address / .data) — Fastspot
// computes the HTLC parameters, we just fund it.
// Verified against @nimiq/core's own enums (AccountType.HTLC = 2,
// TransactionFlag.ContractCreation = 1), matching the docs' description
// of "recipient type 2" — not yet tested against a real funded swap.
function buildSignedHtlcFunding({
  htlcAddress,
  htlcDataHex,
  valueLuna,
  validityStartHeight,
  networkId = MAIN_ALBATROSS,
}) {
  const keyPair = loadKeyPair()
  const sender = keyPair.toAddress()
  const recipient = Nimiq.Address.fromUserFriendlyAddress(htlcAddress)
  const recipientData = new Uint8Array(Buffer.from(htlcDataHex, 'hex'))

  const tx = new Nimiq.Transaction(
    sender,
    Nimiq.AccountType.Basic,
    undefined,
    recipient,
    Nimiq.AccountType.HTLC,
    recipientData,
    BigInt(valueLuna),
    0n,
    Nimiq.TransactionFlag.ContractCreation,
    validityStartHeight,
    networkId,
  )

  const proof = Nimiq.SignatureProof.singleSig(
    keyPair.publicKey,
    keyPair.sign(tx.serializeContent()),
  )
  tx.proof = proof.serialize()

  return Buffer.from(tx.serialize()).toString('hex')
}

function getAddress() {
  return loadKeyPair().toAddress().toUserFriendlyAddress()
}

module.exports = {
  loadKeyPair,
  buildSignedTransfer,
  buildSignedHtlcFunding,
  getAddress,
  TEST_ALBATROSS,
  MAIN_ALBATROSS,
}
