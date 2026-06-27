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

export const config = {
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
  coingeckoUrl: opt("COINGECKO_API_URL", "https://api.coingecko.com/api/v3"),
  coingeckoApiKey: process.env.COINGECKO_API_KEY ?? "",
  coingeckoDashId: opt("COINGECKO_DASH_ID", "dash"),

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
