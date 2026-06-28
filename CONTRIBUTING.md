# Contributing to DashPayBox

Thanks for your interest in improving DashPayBox! Contributions of all kinds are
welcome — bug reports, fixes, docs, and features.

## Development setup

```bash
git clone https://github.com/lexxxell/dashpaybox
cd dashpaybox
cp .env.example .env      # fill in secrets (testnet is the default)
npm install
npm run dev               # tsx watch
```

Other scripts:

```bash
npm run typecheck         # tsc --noEmit
npm run build             # compile to dist/
npm start                 # run the build
npm test                  # node:test suite (via tsx)
```

## Tests

Tests run on the built-in `node:test` runner through `tsx` — no extra deps.
Funds-critical logic (sweep, received amounts, block scan) is tested offline by
injecting a fake SDK and constructing real-format transactions; the block-scan
test uses a real captured testnet block. To (re)capture that fixture:

```bash
node --import tsx scripts/capture-fixtures.ts   # writes tests/fixtures/
```

CI runs `npm test` on every PR.

## Guidelines

- **Code comments in English.** Keep them focused on the *why*, not the *what*.
- **Match the surrounding style** — small, composed functions; the controller
  orchestrates the use case, the service exposes primitives.
- **Type-check before pushing** (`npm run typecheck`); CI runs it on every PR.
- **Keep secrets out of commits.** Never commit a real `.env`, key file, or DB.
- **Security-sensitive areas** (settlement, sweep, finality, key handling) get
  extra scrutiny — explain your reasoning in the PR.

## Pull requests

1. Fork and branch from `main`.
2. Make focused, logically separated commits.
3. Open a PR describing the change and how you verified it.
4. For anything touching funds flow, note the threat model implications.

## Reporting security issues

Please **do not** open a public issue. See [SECURITY.md](SECURITY.md).

## License

By contributing, you agree that your contributions are licensed under the
[MIT License](LICENSE).
