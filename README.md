# DashPayBox

[![Build & publish](https://github.com/lexxxell/dashpaybox/actions/workflows/release.yml/badge.svg)](https://github.com/lexxxell/dashpaybox/actions/workflows/release.yml)
[![CI](https://github.com/lexxxell/dashpaybox/actions/workflows/ci.yml/badge.svg)](https://github.com/lexxxell/dashpaybox/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Image: GHCR](https://img.shields.io/badge/image-ghcr.io%2Flexxxell%2Fdashpaybox-2496ED?logo=docker&logoColor=white)](https://github.com/lexxxell/dashpaybox/pkgs/container/dashpaybox)

Drop-in **Dash payments** for any platform. Run the container, set a few env
vars, and accept Dash via a small HTTP API + signed webhook. Self-contained
(own SQLite DB), no external services to wire beyond your own webhook endpoint.

> **Status:** pre-1.0, **testnet / evaluation-grade**. Payment finality is not
> yet BLS-verified against the LLMQ quorum — see [SECURITY.md](SECURITY.md) and
> [ROADMAP.md](ROADMAP.md) before any mainnet use.

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
{ "event": "confirmed|expired|mismatch|late", "intent_id": "...", "order_id": "...",
  "txid": "...", "sweep_txid": "...", "received_duffs": 100000000, "expected_duffs": 30310034,
  "rate": 2647.3, "rate_source": "coingecko", "occurred_at": "..." }
```
- `confirmed` — grant access (`received_duffs > expected_duffs` ⇒ overpayment; access still granted).
- `mismatch` — underpayment; do **not** grant access.
- `expired` — payment window elapsed with no payment.
- `late` — payment arrived **after** the window expired. Access is **not** granted, but
  the funds are consolidated to `OWNER_STORAGE_ADDRESS` (never stranded on the one-time
  key) — `sweep_txid` is included. Refund the sender out-of-band if you choose.

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

Webhooks may be retried (and a captured one replayed), so make your handler
**idempotent**: dedupe by `(intent_id, event)` and treat repeats as no-ops.
Optionally reject deliveries whose `occurred_at` is far in the past.

## Environment
| Var | Required | Default | Notes |
|---|---|---|---|
| `NETWORK` | – | `testnet` | `mainnet` / `testnet` |
| `OWNER_STORAGE_ADDRESS` | ✅ | – | where funds are swept |
| `KEYS_ENCRYPTION_SECRET` | – | *(auto-gen)* | encrypts one-time keys at rest; if unset, generated on first run next to the DB (back it up) |
| `AUTH_SECRET` | ✅ | – | `X-Dash-Auth` for your backend→service calls |
| `CALLBACK_URL` | ✅ | – | your webhook endpoint |
| `CALLBACK_SECRET` | ✅ | – | HMAC key for webhook signature |

Secrets `AUTH_SECRET`, `CALLBACK_SECRET`, `KEYS_ENCRYPTION_SECRET` may instead be
read from a file via the matching `<NAME>_FILE` env (Docker/K8s secrets),
preferred over plain env. `KEYS_ENCRYPTION_SECRET` auto-generates only on a clean
install; if the DB exists but the key is gone the service refuses to start (it
won't orphan stored keys).
| `DAPI_SEEDS` | – | *(auto-discover)* | comma-separated `https://ip:1443` to pin nodes; if set, used instead of explorer discovery |
| `RATE_CACHE_TTL_SECONDS` | – | `60` | oracle cache window |
| `RATE_MAX_STALE_SECONDS` | – | `600` | max age of a cached rate served on upstream failure |
| `COINGECKO_API_KEY` | – | – | optional demo key |
| `RATE_LIMIT_MAX` | – | `120` | requests per window per IP |
| `RATE_LIMIT_WINDOW_SECONDS` | – | `60` | rate-limit window |
| `MAX_OPEN_INTENTS` | – | `1000` | cap on concurrent open intents (`/intents` → 429 above it) |
| `PAYMENT_WINDOW_SECONDS` | – | `900` | intent expiry |
| `DEFAULT_INSTANT_SEND` | – | `true` | finalize on InstantSend |
| `DEFAULT_MIN_CONFIRMATIONS` | – | `1` | else require N confirmations |
| `RECONCILE_LOOKBACK_BLOCKS` | – | `30` | startup scan to recover payments missed during downtime |
| `MIN_SWEEP_DUFFS` | – | `10000` | min sweepable amount; below it funds are left for manual handling |
| `PORT` | – | `8090` | |

TLS: evonode DAPI is reached without cert verification (servers are addressed by
IP; integrity is from chain proofs). The oracle and your webhook **are** verified.

## Recovery
The watcher sees payments while running and, on startup, scans the last
`RECONCILE_LOOKBACK_BLOCKS` blocks to recover any missed during downtime. A
payment older than that window is recovered by re-driving the intent through the
same `receivedDuffs` → `sendCallback` → `sweep` path.

A payment that lands **after** an intent expired is still consolidated to
`OWNER_STORAGE_ADDRESS` rather than left stranded on the one-time key: the open
subscription catches it within the same run, and on restart `reconcile` re-scans
expired-but-unswept intents within the lookback window. Such funds are swept and
reported via a `late` webhook (no access granted). Note: a late payment to an
intent that expired in a *previous* run is only caught if it landed within the
lookback window before startup (the DAPI client has no address-UTXO query).

## Dev
```bash
cp .env.example .env   # fill secrets
npm install
npm run dev            # tsx watch
npm run build && npm start
```

## Project

- **Examples:** [examples/](examples/) — create-intent + signed-webhook receivers for Node, TypeScript, Python, PHP
- **Contributing:** [CONTRIBUTING.md](CONTRIBUTING.md) · [Code of Conduct](CODE_OF_CONDUCT.md)
- **Security:** [SECURITY.md](SECURITY.md) — report privately, do not open public issues
- **Roadmap:** [ROADMAP.md](ROADMAP.md) — path to mainnet + Dash treasury funding
- **Changelog:** [CHANGELOG.md](CHANGELOG.md)
- **License:** [MIT](LICENSE)

DashPayBox is built for the Dash ecosystem. Continued development is planned via
a Dash treasury proposal — feedback and contributions are welcome.
