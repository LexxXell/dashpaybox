// Service configuration loaded from environment. Secrets live only here.

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

export type Network = "mainnet" | "testnet";

import { createRequire } from "node:module";
const pkg = createRequire(import.meta.url)("../package.json") as { version: string };

export const config = {
  version: pkg.version,
  network: (opt("NETWORK", "testnet") as Network),
  port: parseInt(opt("PORT", "8090"), 10),

  // backend ↔ service auth + callback
  authSecret: req("AUTH_SECRET"),
  callbackUrl: req("CALLBACK_URL"), // e.g. https://host/payments/dash
  callbackSecret: req("CALLBACK_SECRET"),

  // wallet
  ownerStorageAddress: req("OWNER_STORAGE_ADDRESS"),
  keysEncryptionSecret: req("KEYS_ENCRYPTION_SECRET"),

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
  dbPath: opt("DB_PATH", "./data/dash-pay.db"),

  // Dash network access (DAPI / evonodes) — used by the watcher (Phase 2).
  dapiSeeds: opt("DAPI_SEEDS", ""),
};
