// Dash network client (DAPI gRPC-web via dash-core-sdk).
//
// TLS scoping: evonodes serve TLS by IP (cert won't validate) but payment
// validity comes from chain proofs (ChainLock/InstantLock), not TLS — so the
// global dispatcher skips verification (used by the SDK's grpc-web fetch). Our
// own outbound calls (oracle, callback, discovery) go through `secureFetch`
// (see http.ts), which always verifies and never uses this global default.
import { DashCoreSDK } from "dash-core-sdk";
import { Agent, setGlobalDispatcher } from "undici";
import { config } from "./config.js";
import { resolveDapiUrls } from "./discovery.js";

let sdk: DashCoreSDK | null = null;

export async function initDash(): Promise<void> {
  setGlobalDispatcher(new Agent({ connect: { rejectUnauthorized: false } }));
  const urls = await resolveDapiUrls();
  if (urls.length === 0) {
    throw new Error("No DAPI endpoints — set DASH_SEEDS or check network connectivity");
  }
  const options: { network: typeof config.network; dapiUrl?: string | string[] } = {
    network: config.network,
    dapiUrl: urls.length === 1 ? urls[0] : urls,
  };
  sdk = new DashCoreSDK(options as ConstructorParameters<typeof DashCoreSDK>[0]);
  console.log(`dash: ${urls.length} DAPI endpoint(s) on ${config.network}`);
}

export function getSdk(): DashCoreSDK {
  if (sdk === null) throw new Error("Dash SDK not initialized — call initDash() first");
  return sdk;
}
