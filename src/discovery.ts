// Discover active evonode DAPI (gRPC-web) endpoints so the service works
// out of the box without the operator hunting for node IPs.
import { Agent, fetch } from "undici";
import { config } from "./config.js";

// DAPI gRPC-web listens on 1443 (mainnet uses 443 on some nodes; 1443 works for
// platform). Bundled fallbacks if discovery is unavailable.
const BUNDLED: Record<"mainnet" | "testnet", string[]> = {
  testnet: ["https://68.67.122.24:1443", "https://158.160.14.115:1443"],
  mainnet: [],
};

// Evonodes present TLS by IP (cert won't validate); discovery itself targets a
// public explorer with a valid cert, so verify that call normally.
const verifyingAgent = new Agent();

interface Validator {
  proTxInfo?: { state?: { service?: string } };
}

async function fetchActiveNodes(network: "mainnet" | "testnet"): Promise<string[]> {
  const host = network === "mainnet" ? "" : "testnet.";
  const url = `https://${host}platform-explorer.pshenmic.dev/validators?isActive=true&limit=30`;
  const res = await fetch(url, { dispatcher: verifyingAgent, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`explorer ${res.status}`);
  const body = (await res.json()) as { resultSet?: Validator[] };
  const urls = (body.resultSet ?? [])
    .map((v) => v.proTxInfo?.state?.service)
    .filter((s): s is string => Boolean(s))
    .map((s) => `https://${s.split(":")[0]}:1443`);
  return [...new Set(urls)];
}

/** Resolve DAPI URLs: explicit DAPI_SEEDS override → live discovery → bundled. */
export async function resolveDapiUrls(): Promise<string[]> {
  const override = config.dapiSeeds
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (override.length > 0) return override;

  try {
    const discovered = await fetchActiveNodes(config.network);
    if (discovered.length > 0) return discovered;
  } catch {
    // fall through to bundled
  }
  return BUNDLED[config.network];
}
