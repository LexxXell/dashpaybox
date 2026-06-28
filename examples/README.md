# Integration examples

Two things your backend does with DashPayBox:

1. **Create a payment intent** (`POST /intents`, header `X-Dash-Auth: <AUTH_SECRET>`)
   and show the returned `address` / `uri` (QR) to the customer.
2. **Receive the signed webhook** at your `CALLBACK_URL` and grant/deny access.

See the [API & webhook spec](../README.md#http-api-your-backend--service-header-x-dash-auth-auth_secret).

## Webhook handling — get these right

- **Verify over the RAW request body.** Compute
  `HMAC-SHA256(rawBytes, CALLBACK_SECRET)` and compare to the `X-Dash-Signature`
  header **before** parsing JSON. Re-serializing the parsed body will change the
  bytes and break verification.
- **Use a constant-time comparison** (`timingSafeEqual` / `hmac.compare_digest`
  / `hash_equals`).
- **Be idempotent.** Webhooks may be retried (and a captured one replayed) —
  dedupe by `(intent_id, event)` and treat repeats as no-ops.
- **Return 2xx** once handled, so the service stops retrying.

## Events

| Event | Meaning | Action |
|---|---|---|
| `confirmed` | paid & final (`received_duffs > expected_duffs` ⇒ overpayment) | grant access |
| `mismatch` | underpayment | do **not** grant |
| `late` | paid after expiry; funds swept to your cold address (`sweep_txid`) | refund out-of-band if you choose; do not grant |
| `expired` | window elapsed, no payment | nothing |

## Env used by the examples

| Var | Meaning |
|---|---|
| `DASH_SERVICE_URL` | DashPayBox base URL (e.g. `http://localhost:8090`) |
| `DASH_AUTH_SECRET` | matches the service `AUTH_SECRET` |
| `DASH_CALLBACK_SECRET` | matches the service `CALLBACK_SECRET` |

Per language: [node](node/) · [typescript](typescript/) · [python](python/) · [php](php/)
