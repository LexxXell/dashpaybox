# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Upgraded runtime dependencies: `@dashevo/dashcore-lib` 0.25, `better-sqlite3`
  12, `fastify` 5 — validated by the test suite. `undici` held at 6 (v8 requires
  Node 22; a Node 20→22 migration is tracked separately).

### Added

- Test coverage for the finality gate (`awaitFinality`), the sweep path
  (multi-output, minimum amount, signing) and block scanning against a real
  testnet block.

## [0.1.0] - 2026-06-28

First public release: a drop-in Dash payments microservice (HTTP API + signed
webhook, self-contained SQLite).

### Added

- Payment intents: fiat→DASH quote with locked rate, one-time receive address,
  `dash:` URI, expiry window.
- Chain watcher: live detection (mempool + new blocks) and startup reconcile of
  payments missed during downtime.
- Settlement: finality via InstantSend / ChainLock / N confirmations, then sweep
  to the cold `OWNER_STORAGE_ADDRESS`.
- Signed (HMAC-SHA256) settlement webhooks with retry/backoff: `confirmed`,
  `mismatch`, `expired`, `late`.
- Consolidation of late / post-expiry payments to cold (no access granted) via
  the `late` webhook — funds are never stranded on a one-time key.
- Zero-config DAPI node auto-discovery, overridable with `DAPI_SEEDS`.
- File-based secrets (`<NAME>_FILE`) and safe auto-generation of
  `KEYS_ENCRYPTION_SECRET` on a clean install.
- Hardening: schema-validated API input, rate limiting, open-intent cap, bounded
  stale-rate fallback, request timeouts, verified outbound TLS, multi-output and
  minimum-amount sweeps, graceful shutdown.
- Container image published to GHCR; CI typecheck/build.

### Known limitations

- ChainLock / InstantLock BLS signatures are not yet verified against the LLMQ
  quorum; finality currently trusts the DAPI node. See
  [SECURITY.md](SECURITY.md) and [ROADMAP.md](ROADMAP.md). Testnet /
  evaluation-grade until addressed.

[Unreleased]: https://github.com/lexxxell/dashpaybox/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/lexxxell/dashpaybox/releases/tag/v0.1.0
