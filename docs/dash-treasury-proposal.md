# Dash Treasury Proposal — DashPayBox (DRAFT)

> **Status: DRAFT for pre-proposal discussion.** Figures marked _(set: …)_ must be
> finalized before submission. Discuss on the [Dash forum](https://www.dash.org/forum/)
> and DashCentral first; confirm the current DASH price and treasury headroom at
> submission time. Submitting a proposal burns a **5 DASH** fee.

## 1. Summary

DashPayBox is an open-source, self-hosted **Dash payment gateway**: run one
container, set a few environment variables, and accept Dash on any platform via a
small HTTP API and signed webhooks. Funds are swept to a cold address the
operator controls; the service never becomes a custodian beyond a brief
settlement window.

This proposal requests treasury funding to take DashPayBox from
**evaluation-grade to production-grade on mainnet** — primarily **trust-minimized
payment-finality verification** and an **independent security audit** — so that
merchants can accept Dash with a drop-in component instead of building an
integration from scratch.

- **Proposer:** LexxXell _(set: bio / prior Dash or OSS contributions)_
- **Repository:** https://github.com/lexxxell/dashpaybox (MIT)
- **Container image:** `ghcr.io/lexxxell/dashpaybox`
- **Requested:** _(set: total DASH)_ over _(set: N)_ monthly cycles — see §6
- **Contact:** _(set: forum handle / email / Keybase / Discord)_

## 2. Problem & opportunity

Accepting Dash today usually means wiring up a node or a third-party processor,
handling address derivation, confirmation/InstantSend logic, reconciliation, and
webhooks — non-trivial, security-sensitive plumbing that every integrator
re-implements. There is no widely-used, self-hosted, drop-in payment component
that a merchant backend can adopt in an afternoon.

Lower integration friction → more places that accept Dash → more real-world Dash
payment utility. A maintained, audited, self-hostable gateway is durable public
infrastructure for the ecosystem.

## 3. What's already built (self-funded to date)

DashPayBox is not a concept — a working **v0.1.0** is published:

- **Payments flow:** fiat→DASH quote with locked rate, one-time receive address +
  `dash:` URI, expiry window.
- **Settlement:** finality via InstantSend / ChainLock / N confirmations, then
  sweep to the cold `OWNER_STORAGE_ADDRESS` (env-only — a DB compromise cannot
  redirect funds). One-time keys are AES-256-GCM encrypted at rest.
- **Webhooks:** HMAC-SHA256 signed, retried with backoff (`confirmed`,
  `mismatch`, `expired`, `late`); late/post-expiry payments are consolidated to
  cold rather than stranded.
- **Operability:** zero-config DAPI node auto-discovery, file-based secrets,
  graceful shutdown, rate limiting, schema-validated API.
- **Engineering hygiene:** TypeScript on **Node 22 LTS**, automated test suite
  (wallet/keys, sweep, finality gate, oracle, API, real-testnet-block parsing)
  run in CI on every PR, protected `main`, reproducible Docker build published to
  GHCR.
- **Integration examples:** copy-pasteable create-intent + signed-webhook
  receivers for **Node, TypeScript, Python, and PHP**
  ([examples/](../examples/)), covering the common-pitfall rules (verify HMAC
  over the raw body, constant-time compare, idempotency).
- **Security posture:** a self-conducted audit was completed and its findings
  fixed; the one remaining item (cryptographic finality verification — see §4) is
  the headline deliverable of this proposal and is documented transparently in
  [SECURITY.md](../SECURITY.md).

This de-risks funding: the treasury is asked to fund **hardening and audit of a
working product**, not greenfield development.

## 4. Scope of funded work

Mapped to the [roadmap](../ROADMAP.md). **P0 is the priority.**

### M1 — Trust-minimized finality (P0)

Today, payment finality relies on the lock status (ChainLock / InstantLock) and
confirmation count **reported by the DAPI node** the service queries; those BLS
signatures are not yet verified against the active LLMQ quorum. M1 closes this:

- Verify ChainLock / InstantLock **BLS signatures** against the active LLMQ
  quorum (work spans the Dash SDK and DashPayBox integration).
- Trust-minimized node selection: multiple independent DAPI endpoints with
  quorum agreement; verified sourcing of quorum public keys.
- Tests + testnet integration coverage for the finality path.

**Outcome:** a malicious or impersonated node can no longer fake a confirmation —
the prerequisite for safe mainnet use.

### M2 — Independent security audit + remediation (P0)

- Engage an independent reviewer/firm to audit the custody, settlement, sweep,
  key-handling, and finality code.
- Publish the report and remediate findings.

### M3 — Robustness & operability (P1)

- Persistent periodic reconcile (recover late payments beyond startup lookback).
- Dynamic sweep-fee estimation; consolidation across multiple funding txs.
- Metrics/health endpoints and a structured settlement audit log.
- Multiple rate oracles with median/sanity bounds; configurable currencies.

### (Stretch) M4 — Adoption (P2)

Integration examples for Node, TypeScript, Python, and PHP **already ship**
([examples/](../examples/)); M4 builds on them: packaged backend SDKs, an
e-commerce plugin, a hosted demo and quickstart — pursued only if M1–M3 complete
within budget.

## 5. Deliverables & acceptance

| Milestone | Deliverable | Acceptance |
|---|---|---|
| M1 | BLS-verified finality + multi-node agreement | merged + tested; published write-up; testnet demo |
| M2 | Independent audit report + fixes | report public in-repo; findings resolved |
| M3 | Reconcile/metrics/fees/oracles | merged + tested; documented |
| M4 | SDKs/plugin/demo | published; demo reachable |

All code MIT, in the public repo, behind the existing PR + CI process.

## 6. Budget & schedule

Dash treasury cycles are ~monthly (~30.29 days); approved proposals are paid in
DASH at the superblock. _(set: choose number of cycles — splitting into 2–3
monthly payments is common and reassures voters.)_

| Item | Basis | Amount (USD-equiv) |
|---|---|---|
| Development (M1, M3) | _(set: $/month × months)_ | _(set)_ |
| Independent security audit (M2) | one-time | _(set)_ |
| Infrastructure (CI, hosted demo, testnet) | small monthly | _(set)_ |
| Proposal fee | 5 DASH, burned at submission | n/a |
| **Total** | | **_(set)_** |

**DASH amount:** compute `USD ÷ DASH_price_at_submission` and add a **~10–15%
volatility buffer**; request a fixed DASH amount per cycle. Note the risk that a
mid-cycle price drop reduces real funding (see §9).

## 7. Success metrics (KPIs)

- M1 finality verification merged, tested, and documented; testnet demonstration.
- Published independent audit with findings remediated.
- _(set: target)_ GitHub stars / forks / external contributors.
- _(set: target)_ documented production deployments / integrators.
- Green CI and timely dependency maintenance throughout.

## 8. Accountability & reporting

- **Monthly progress reports** on the Dash forum / DashCentral, linked to merged
  PRs and releases.
- All work in the open: public repo, public PRs, public CI.
- For multi-cycle funding, MNOs can withhold subsequent-cycle votes if milestones
  slip. _(Optional: escrow via Dash Trust Protectors for larger amounts.)_

## 9. Risks & mitigations

| Risk | Mitigation |
|---|---|
| DASH price drop mid-cycle reduces real funding | volatility buffer; milestone-based multi-cycle requests |
| Finality verification depends on Dash SDK internals | upstream where possible; keep verification logic in-repo and tested |
| Single maintainer / bus factor | MIT + docs + tests lower onboarding; invite contributors |
| Scope creep | P0 (M1/M2) fixed; M3/M4 are explicitly secondary/stretch |
| Audit finds major issues | budget reserves remediation time in M2 |

## 10. Why fund this

- **Real utility:** removes the biggest friction to accepting Dash — integration
  effort — for any merchant/platform.
- **Public good:** MIT, self-hostable, no lock-in, no rent extraction.
- **Low risk:** a working product hardened and audited, not a from-scratch bet.
- **Showcases Dash strengths:** InstantSend/ChainLock finality as a first-class
  payment primitive.

## 11. Links

- Repository: https://github.com/lexxxell/dashpaybox
- Release v0.1.0: https://github.com/lexxxell/dashpaybox/releases/tag/v0.1.0
- Roadmap: [ROADMAP.md](../ROADMAP.md) · Security: [SECURITY.md](../SECURITY.md)
- Container: `ghcr.io/lexxxell/dashpaybox`

## 12. The ask

Vote **YES** to fund production-hardening and an independent security audit of an
already-working, MIT-licensed Dash payment gateway. _(set: restate total DASH and
cycle schedule.)_

---

### Appendix — pre-proposal checklist

- [ ] Post pre-proposal on the Dash forum and gather MNO feedback
- [ ] Finalize all _(set: …)_ figures; verify DASH price + treasury headroom
- [ ] Decide cycle count and per-cycle DASH amount (with buffer)
- [ ] Line up the independent auditor (scope + quote)
- [ ] Prepare a payout Dash address (and escrow, if used)
- [ ] Submit on-chain (5 DASH fee) and create the DashCentral listing
