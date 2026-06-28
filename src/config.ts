// Service configuration loaded from environment. Secrets live only here.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env: ${name}`);
  return v;
}
function opt(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}
function bool(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (v === undefined) return fallback;
  return v === "1" || v.toLowerCase() === "true";
}

// Resolve a required secret from env, or from a `<NAME>_FILE` path (e.g. a
// Docker/K8s secret mounted read-only) — preferred over env, which leaks more
// readily (/proc, logs, crash dumps, child processes).
function secret(name: string): string {
  const direct = process.env[name];
  if (direct) return direct;
  const file = process.env[`${name}_FILE`];
  if (file) {
    const v = readFileSync(file, "utf8").trim();
    if (!v) throw new Error(`Empty secret file for ${name}: ${file}`);
    return v;
  }
  throw new Error(`Missing required env: ${name} (or ${name}_FILE)`);
}

// KEYS_ENCRYPTION_SECRET is internal-only (unlike AUTH/CALLBACK secrets, which
// are shared with your backend), so it may be auto-generated. It is persisted
// ALONGSIDE the DB so the two share a lifecycle: regenerating it would make
// every stored one-time key undecryptable (= lost funds). Therefore we only
// auto-generate on a clean install (no DB yet); if a DB exists but the key is
// gone we refuse rather than orphan stored keys. For hardened deployments,
// provide it externally (env or _FILE) to keep it off the data volume.
function resolveKeysEncryptionSecret(dbPath: string): string {
  const direct = process.env.KEYS_ENCRYPTION_SECRET;
  if (direct) return direct;

  const path = process.env.KEYS_ENCRYPTION_SECRET_FILE ?? join(dirname(dbPath), "keys_encryption_secret");
  if (existsSync(path)) {
    const v = readFileSync(path, "utf8").trim();
    if (v) return v;
  }
  if (existsSync(dbPath)) {
    throw new Error(
      `KEYS_ENCRYPTION_SECRET missing but a DB exists at ${dbPath} — refusing to ` +
        `generate a new key (it would orphan stored one-time keys). Restore the ` +
        `original secret at ${path} or via env.`,
    );
  }
  mkdirSync(dirname(path), { recursive: true });
  const generated = randomBytes(32).toString("hex");
  writeFileSync(path, generated, { mode: 0o600 });
  console.warn(
    `KEYS_ENCRYPTION_SECRET not provided — generated a new key at ${path}. It lives ` +
      `on the data volume next to the DB; back it up and never delete it (losing it ` +
      `makes stored one-time keys undecryptable). Provide it via env or ` +
      `KEYS_ENCRYPTION_SECRET_FILE for production.`,
  );
  return generated;
}

export type Network = "mainnet" | "testnet";

import { createRequire } from "node:module";
const pkg = createRequire(import.meta.url)("../package.json") as { version: string };

const dbPath = opt("DB_PATH", "./data/dash-pay.db");

export const config = {
  version: pkg.version,
  network: (opt("NETWORK", "testnet") as Network),
  port: parseInt(opt("PORT", "8090"), 10),

  // backend ↔ service auth + callback
  authSecret: secret("AUTH_SECRET"),
  callbackUrl: req("CALLBACK_URL"), // e.g. https://host/payments/dash
  callbackSecret: secret("CALLBACK_SECRET"),

  // wallet
  ownerStorageAddress: req("OWNER_STORAGE_ADDRESS"),
  keysEncryptionSecret: resolveKeysEncryptionSecret(dbPath),

  // oracle
  rateCacheTtlSeconds: parseInt(opt("RATE_CACHE_TTL_SECONDS", "60"), 10),
  // Hard cap on how stale a cached rate may be served when the upstream is
  // failing; beyond this the quote fails rather than mispricing the intent.
  rateMaxStaleSeconds: parseInt(opt("RATE_MAX_STALE_SECONDS", "600"), 10),
  coingeckoUrl: opt("COINGECKO_API_URL", "https://api.coingecko.com/api/v3"),
  coingeckoApiKey: process.env.COINGECKO_API_KEY ?? "",
  coingeckoDashId: opt("COINGECKO_DASH_ID", "dash"),

  // abuse controls (HTTP API)
  rateLimitMax: parseInt(opt("RATE_LIMIT_MAX", "120"), 10),
  rateLimitWindowSeconds: parseInt(opt("RATE_LIMIT_WINDOW_SECONDS", "60"), 10),
  maxOpenIntents: parseInt(opt("MAX_OPEN_INTENTS", "1000"), 10),

  // sweeping: never build a sweep below this (fee + dust would make it invalid).
  minSweepDuffs: parseInt(opt("MIN_SWEEP_DUFFS", "10000"), 10),

  // payment lifecycle
  paymentWindowSeconds: parseInt(opt("PAYMENT_WINDOW_SECONDS", "900"), 10),
  defaultInstantSend: bool("DEFAULT_INSTANT_SEND", true),
  defaultMinConfirmations: parseInt(opt("DEFAULT_MIN_CONFIRMATIONS", "1"), 10),
  // On startup, scan the last N blocks for payments missed while the service
  // was down (the live watcher only sees mempool + new blocks).
  reconcileLookbackBlocks: parseInt(opt("RECONCILE_LOOKBACK_BLOCKS", "30"), 10),

  // storage
  dbPath,

  // Dash network access (DAPI / evonodes) — used by the watcher (Phase 2).
  dapiSeeds: opt("DAPI_SEEDS", ""),
};
