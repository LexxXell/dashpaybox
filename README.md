# DashPayBox

Drop-in **Dash payments** for any platform. Run the container, set a few env
vars, and accept Dash via a small HTTP API + signed webhook. Self-contained
(own SQLite DB), no external services to wire beyond your own webhook endpoint.

## Quickstart
```bash
docker run -d --name dash-pay -p 8090:8090 -v dashpay:/app/data \
  -e NETWORK=mainnet \
  -e OWNER_STORAGE_ADDRESS=Xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx \
  -e KEYS_ENCRYPTION_SECRET="$(openssl rand -hex 32)" \
  -e AUTH_SECRET="$(openssl rand -hex 24)" \
  -e CALLBACK_URL=https://your-app.example/webhooks/dash \
  -e CALLBACK_SECRET="$(openssl rand -hex 24)" \
  <image>
```
DAPI nodes are **auto-discovered** — no node list to maintain.

## How it works
1. Your backend calls `POST /intents` with the fiat amount → service derives a
   fresh one-time address, locks a fiat→DASH rate, returns address + `dash:` URI.
2. The customer pays. The watcher detects the payment (mempool + new blocks) and
   waits for finality (InstantSend, or `min_confirmations` block confirmations;
   a ChainLock always counts).
3. The service POSTs a **signed webhook** to `CALLBACK_URL`, then **sweeps** the
   funds to `OWNER_STORAGE_ADDRESS`.

Security: one-time private keys are AES-256-GCM encrypted at rest with
`KEYS_ENCRYPTION_SECRET`; the sweep destination is read from env only, so a DB
compromise cannot redirect funds. Payment validity comes from chain proofs
(ChainLock/InstantLock), and webhooks are HMAC-signed.

No recurring (crypto can't auto-charge) and no automatic refunds (handle
under/over-payments — flagged via webhook — manually).

## HTTP API (your backend → service, header `X-Dash-Auth: <AUTH_SECRET>`)
| Method | Path | Body / result |
|---|---|---|
| POST | `/quote` | `{amount_minor, currency}` → `{duffs, amount, rate, rate_source}` |
| POST | `/intents` | `{order_id, amount_minor, currency, instant_send?, min_confirmations?}` → `{intent_id, address, duffs, amount, rate, rate_source, uri, expires_at}` |
| GET | `/intents/:id` | `{intent_id, status, address, duffs, received_duffs?, txid?, sweep_txid?}` |
| GET | `/health`, `/version` | unauthenticated |

`status` ∈ `pending | seen | confirmed | swept | expired | mismatch`.

## Webhook (service → your backend)
`POST {CALLBACK_URL}` with header `X-Dash-Signature: hex(HMAC-SHA256(body, CALLBACK_SECRET))`,
retried with backoff. Body:
```json
{ "event": "confirmed|expired|mismatch", "intent_id": "...", "order_id": "...",
  "txid": "...", "received_duffs": 100000000, "expected_duffs": 30310034,
  "rate": 2647.3, "rate_source": "coingecko", "occurred_at": "..." }
```
- `confirmed` — grant access (`received_duffs > expected_duffs` ⇒ overpayment; access still granted).
- `mismatch` — underpayment; do **not** grant access.
- `expired` — payment window elapsed with no payment.

Verify the signature before trusting the body:
```js
import { createHmac, timingSafeEqual } from "node:crypto";
const sig = createHmac("sha256", CALLBACK_SECRET).update(rawBody).digest("hex");
const ok = timingSafeEqual(Buffer.from(sig), Buffer.from(req.header("X-Dash-Signature")));
```
```python
import hmac, hashlib
expected = hmac.new(CALLBACK_SECRET.encode(), raw_body, hashlib.sha256).hexdigest()
ok = hmac.compare_digest(expected, request.headers["X-Dash-Signature"])
```

## Environment
| Var | Required | Default | Notes |
|---|---|---|---|
| `NETWORK` | – | `testnet` | `mainnet` / `testnet` |
| `OWNER_STORAGE_ADDRESS` | ✅ | – | where funds are swept |
| `KEYS_ENCRYPTION_SECRET` | ✅ | – | encrypts one-time keys at rest |
| `AUTH_SECRET` | ✅ | – | `X-Dash-Auth` for your backend→service calls |
| `CALLBACK_URL` | ✅ | – | your webhook endpoint |
| `CALLBACK_SECRET` | ✅ | – | HMAC key for webhook signature |
| `DAPI_SEEDS` | – | *(auto-discover)* | comma-separated `https://ip:1443` to pin nodes |
| `RATE_CACHE_TTL_SECONDS` | – | `60` | oracle cache window |
| `COINGECKO_API_KEY` | – | – | optional demo key |
| `PAYMENT_WINDOW_SECONDS` | – | `900` | intent expiry |
| `DEFAULT_INSTANT_SEND` | – | `true` | finalize on InstantSend |
| `DEFAULT_MIN_CONFIRMATIONS` | – | `1` | else require N confirmations |
| `RECONCILE_LOOKBACK_BLOCKS` | – | `30` | startup scan to recover payments missed during downtime |
| `PORT` | – | `8090` | |

TLS: evonode DAPI is reached without cert verification (servers are addressed by
IP; integrity is from chain proofs). The oracle and your webhook **are** verified.

## Recovery
The watcher sees payments while running and, on startup, scans the last
`RECONCILE_LOOKBACK_BLOCKS` blocks to recover any missed during downtime. A
payment older than that window is recovered by re-driving the intent through the
same `receivedDuffs` → `sendCallback` → `sweep` path.

## Dev
```bash
cp .env.example .env   # fill secrets
npm install
npm run dev            # tsx watch
npm run build && npm start
```
