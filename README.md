# Kindo

**Pay in NIM. Get the real thing.**

Kindo is a [Nimiq Pay](https://nimiq.com/nimiq-pay) mini app. A customer pays NIM
inside their wallet and receives something real — airtime on their phone, a gift
card code, a flight ticket, a restaurant table. No card, no account, no KYC:
the NIM payment is the whole checkout.

Live: **https://kindo-production.up.railway.app** (open it from inside Nimiq Pay)

## What you can buy

| Flow | Provider | What the customer gets | Status |
|---|---|---|---|
| **Airtime & Data** | [Bitrefill](https://www.bitrefill.com) (x402) | Mobile top-up on any number, 180+ countries | Live |
| **Shop** | Bitrefill gift cards (x402) | Amazon, Steam, Roblox, Spar Nigeria… 10,000+ brands, delivered as a code | Live |
| **Flights** | [BRIJ](https://brij.fi) (x402) | Real fares, escrow-backed booking, airline ticket | Live search; booking wired, pays the fare into BRIJ's escrow |
| **Dining** | [AgentRes](https://agentres.dev) / Resy (x402) | A real Resy reservation | Wired; needs a Resy account linked once |

Every provider is paid over [x402](https://x402.org) — HTTP 402 micropayments in
USDC — so Kindo needs no API keys, contracts, or merchant accounts with any of them.

## How a purchase works

```
Nimiq Pay ──NIM tx (orderId in memo)──▶ Kindo receive wallet
                                              │
        payment watcher (Albatross RPC, 5s) ──┘
                                              │
                    ┌─────────────────────────┴──────────────────────────┐
                    │ small order (< SimpleSwap min, ~$22)               │ large order
                    │ fulfil from the standing USDC float;               │ forward NIM to SimpleSwap,
                    │ NIM accrues toward a later batch swap              │ USDC lands on the target chain
                    └─────────────────────────┬──────────────────────────┘
                                              │
                      spend guard: provider cost ≤ NIM received × 1.05
                                              │
                          x402 payment to the provider (USDC on Base or Solana)
                                              │
                    receipt polls /api/orders/:id/delivery ── code / status
```

1. The mini app registers the order (`POST /api/orders/<type>`) and asks Nimiq Pay
   to send NIM to Kindo's address with the order id as the transaction memo.
2. The server's watcher sees the transaction, matches the memo to the order, and
   records the amount and tx hash.
3. The bridge picks a USDC source — the float for small orders, a
   [SimpleSwap](https://simpleswap.io) NIM→USDC swap for large ones — then pays the
   provider over x402. Airtime and gift cards settle on **Base** (gasless: the
   provider's facilitator pays the fee). Flights settle on **Solana**.
   NIM left behind by float-mode orders is **swept** back into USDC on Base in
   batches once it clears the swap minimum (`server/src/sweep.js`, triggered
   after each float fulfilment; `node scripts/sweep.js --dry-run` shows the plan).
4. The receipt polls for fulfilment. Gift-card codes appear on the receipt and stay
   retrievable under **Past receipts**.

### Why the two chains

Bitrefill, BRIJ and AgentRes each accept x402 on Base and/or Solana. Kindo holds a
small USDC float on Base for airtime and gift cards (no ETH needed — every payment
is an EIP-3009 authorisation the facilitator broadcasts) and a Solana wallet that
pays for searches and BRIJ escrow. The Solana wallet runs with 0 SOL; fees are
sponsored by the x402 facilitators.

## Repository

```
mini-app/   React + Vite frontend (the mini app itself)
  src/screens/    Landing, Home (pass deck), Shop, Flights, Restaurants,
                  Utilities, History, PurchaseFlow (shared search→confirm→pay→receipt)
  src/lib/        nimiqPay.js (SDK, payment), history.js (receipts, screen persistence)
server/     Express API + payment watcher + fulfilment bridge
  src/server.js         routes, rate limits, watcher
  src/bridge.js         float/swap decision, spend guard, per-flow fulfilment
  src/paymentWatcher.js memo decoding
  src/nimiqRpc.js       Albatross RPC (getTransactionsByAddress, pushTransaction)
  src/x402Base.js       hand-built x402 v2 client for Base (EIP-3009)
  src/*Client.js        Bitrefill, BRIJ, AgentRes, SimpleSwap
  orders.json           order store (Railway volume at /data in production)
```

## Security model

- **Nothing the client sends decides what gets spent.** Prices come from the
  providers; the bridge checks every provider cost against the NIM actually
  received (×1.05 tolerance) before paying. Flights cap the x402 client to
  exactly BRIJ's escrow amount.
- **Order ids are guessable, so they reveal nothing.** `GET /api/orders/:id`
  returns status only. `GET /api/orders/:id/delivery` — status, gift-card codes —
  requires the payment tx hash, which only the paying wallet ever saw.
- **Paid provider calls are rate-limited** per IP (searches 8/min, the API 60/min)
  so an unthrottled endpoint can't drain the wallets.
- Secrets live in `server/.env` (gitignored) and Railway variables.

## License

MIT — see [LICENSE](LICENSE).
