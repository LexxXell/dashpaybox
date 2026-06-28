# Roadmap

DashPayBox aims to be the easiest self-hosted way to accept Dash on any
platform: run a container, get an HTTP API + signed webhooks, funds swept to your
cold address. This roadmap frames the path from evaluation-grade to
production-grade and is the basis for a Dash treasury funding proposal.

## P0 — Mainnet hardening (trust-minimization)

- **Verify ChainLock / InstantLock BLS signatures** against the active LLMQ
  quorum, so payment finality no longer trusts a single DAPI node's reported
  status. (Today's top limitation — see [SECURITY.md](SECURITY.md).)
- **Trust-minimized node selection:** multiple independent DAPI endpoints with
  quorum agreement; verified quorum public-key sourcing.
- **Test suite & coverage** for settlement, sweep, finality, and oracle paths;
  integration tests against testnet.

## P1 — Robustness & operability

- Persistent, periodic reconcile to recover late payments beyond the startup
  lookback window.
- Dynamic sweep fee estimation; consolidation across multiple funding txs.
- Metrics/health endpoints (Prometheus), structured audit log of settlements.
- Multiple rate oracles with median/sanity bounds; configurable currencies.

## P2 — Product & ecosystem

- Optional merchant-side refund helper (refunds stay a merchant decision; the
  box stays a custody/settlement primitive).
- Admin/status dashboard.
- SDKs/snippets for common backends (Node, Python, PHP) and e-commerce plugins.
- Hosted demo and quickstart guides.

## Funding

We intend to submit a Dash treasury proposal to fund continued development,
prioritizing P0 (mainnet trust-minimization) and an independent security review.
A draft is in [docs/dash-treasury-proposal.md](docs/dash-treasury-proposal.md).
Feedback on priorities is welcome via issues.
