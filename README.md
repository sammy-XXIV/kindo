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
| **Dining** | [AgentRes](https://agentres.dev) / Resy (x402) | A real Resy reservation | Wired; needs a Resy account linked once (see below) |

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

## Running locally

Node 22+.

```bash
# API (port 3001)
cd server && npm install && node src/server.js

# mini app (Vite dev server, proxies /api to :3001)
cd mini-app && npm install && npm run dev
```

`DEMO_MODE=true node src/server.js` mocks the NIM payment and fulfilment so the
whole flow can be walked without funds. Searches still hit the real providers
(and cost a few cents of Solana USDC each).

The mini app must be opened from inside Nimiq Pay for real payments — the SDK
waits for the wallet's provider and times out in a plain browser.

### Environment (`server/.env`)

| Variable | Purpose |
|---|---|
| `NIMIQ_ADDRESS`, `NIMIQ_PRIVATE_KEY` | Receive wallet; the key signs NIM forwards for swaps |
| `NIMIQ_RPC_URL` | Albatross RPC (default `https://rpc.nimiqwatch.com`) |
| `EVM_ADDRESS`, `EVM_PRIVATE_KEY` | Base wallet holding the USDC float; AgentRes account identity |
| `SOLANA_ADDRESS`, `SOLANA_SECRET_KEY` | Solana wallet for x402 searches and BRIJ escrow |
| `SIMPLESWAP_API_KEY` | NIM→USDC swaps for orders above the float threshold |
| `DEMO_MODE` | `true` mocks payment + fulfilment |
| `DATA_DIR` | Where `orders.json` / `sweeps.json` live (`/data` on Railway) |
| `SWEEP_RESERVE_NIM` | NIM kept back from sweeps for fees (default 5) |
| `PORT` | API port (Railway sets it) |

Generate wallets with `server/scripts/generate-*.js`.

### One-time setup for Dining

AgentRes books through Resy, so the Base wallet needs a Resy account linked to it
once (the Resy account needs a card on file):

```bash
cd server
node _link_resy.js you@resy-email.com          # emails a 6-digit code
node _link_resy.js you@resy-email.com 123456   # done
```

Until then the Dining search reports "not set up yet" rather than showing venues
it cannot book.

## Deploying

Railway, Railpack builder. The root `package.json` `build` script builds the mini
app and installs the server; `start` runs the API, which also serves
`mini-app/dist`. Attach a volume at `/data` and set `DATA_DIR=/data` so orders
survive restarts.

```bash
railway up --service kindo
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

## Known limitations

- **Float depth.** Between sweeps the Base float is finite; an order larger than
  what's on hand fails cleanly ("float is empty") rather than overspending.
- **NIM price risk** between quote and payment is absorbed by the ×1.05 tolerance —
  a sharp dip fails the order safely rather than overspending.
- **Flights** cannot be exercised end-to-end without paying a real fare; the intent
  and escrow path is wired per BRIJ's contract but unproven with real money.
- **Dining** is gated on the Resy link above.
- Physical Amazon goods are not offered: every agent-commerce provider ships them to
  the US only. Gift cards deliver anywhere.
- The rate limiter is in-memory (single instance).
