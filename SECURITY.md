# Security Policy

DashPayBox custodies funds (briefly) and authorizes access on payment, so we
take security seriously and prefer to fix issues before they are public.

## Reporting a vulnerability

**Do not open a public issue for security reports.** Instead:

- Use GitHub's private **"Report a vulnerability"** (Security → Advisories), or
- Email **lexxxell007@gmail.com** with details and, if possible, a proof of
  concept.

We aim to acknowledge within 72 hours and to agree on a disclosure timeline.
Credit is given to reporters who wish to be named.

## Supported versions

DashPayBox is pre-1.0 and under active development. Only the latest `0.x` release
receives fixes. Pin a specific image tag (`sha-…` or `vX.Y.Z`) in production.

## Security model

- **One-time keys.** Each intent gets a fresh keypair; the private key (WIF) is
  AES-256-GCM encrypted at rest with `KEYS_ENCRYPTION_SECRET`.
- **Cold sweep destination is env-only.** Funds are swept to
  `OWNER_STORAGE_ADDRESS`, read from the environment and never from the DB, so a
  database compromise cannot redirect funds.
- **Signed webhooks.** Settlement callbacks are HMAC-SHA256 signed with
  `CALLBACK_SECRET`; verify the signature before trusting the payload.
- **Authenticated API.** Backend→service calls require `X-Dash-Auth`, compared
  in constant time. Input is schema-validated; the API is rate-limited.
- **Secrets** may be supplied via `<NAME>_FILE` (Docker/K8s secrets) instead of
  plain env.

## Known limitations (roadmap)

- **Payment finality verification.** Finality currently relies on the lock
  status (ChainLock / InstantLock) and confirmation count **reported by the DAPI
  node** the service talks to; the BLS signatures of those locks are not yet
  verified against the active LLMQ quorum. A malicious or impersonated node could
  therefore misreport finality. Cryptographic verification of ChainLock /
  InstantLock is the top roadmap item for mainnet hardening. **Until then, treat
  DashPayBox as testnet / evaluation-grade** and run it against DAPI nodes you
  trust (pin `DAPI_SEEDS`). See [ROADMAP.md](ROADMAP.md).
