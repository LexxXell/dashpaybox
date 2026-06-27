# dash-pay

Dash crypto payment microservice for the content platform. Self-contained
(own SQLite DB), reached only over the internal docker network by the backend;
it calls back the backend's `/payments/dash` webhook on settlement.

## Model
- **Forwarding/sweep:** each payment intent gets a fresh one-time keypair. The
  private key is AES-256-GCM encrypted with `KEYS_ENCRYPTION_SECRET` and stored
  in the DB. On settlement, funds are swept to `OWNER_STORAGE_ADDRESS` (read
  from env only — a DB compromise cannot redirect funds).
- **No recurring:** crypto can't auto-charge; the backend marks Dash
  subscriptions non-renewing.
- **Oracle:** fiat→DASH via CoinGecko with a short cache window
  (`RATE_CACHE_TTL_SECONDS`, default 60s; serves stale on upstream failure).

## API (backend → service, header `X-Dash-Auth`)
- `POST /quote {amount_minor, currency}` → `{duffs, amount, rate, rate_source}`
- `POST /intents {order_id, amount_minor, currency, instant_send?, min_confirmations?}`
  → `{intent_id, address, duffs, amount, rate, rate_source, uri, expires_at}`
- `GET /intents/:id` → `{intent_id, status, address, duffs, received_duffs?, txid?, sweep_txid?}`
- `GET /health`

## Callback (service → backend, HMAC `X-Dash-Signature`)
`POST {CALLBACK_URL}` `{event: confirmed|expired|mismatch, intent_id, order_id, txid?, received_duffs?, expected_duffs, rate, rate_source, occurred_at}`

## Status
Phase 1 scaffold: config, DB, oracle+cache, one-time key generation, REST API,
HMAC callbacks, and the expiry timer are implemented. **Chain watching**
(`watcher.ts`) and **sweeping** (`sweeper.ts`) are stubs to be wired in Phase 2
using `dash-core-sdk` (DAPI gRPC bloom-filter subscription, InstantSend /
confirmations) and `dash-core-p2p` (broadcast).

## Dev
```bash
cp .env.example .env   # fill secrets
npm install
npm run dev            # tsx watch
npm run build && npm start
```
