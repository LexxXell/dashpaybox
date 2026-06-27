// Dash network client (DAPI gRPC via dash-core-sdk): payment detection +
// transaction broadcast. Lazily constructed singleton.
import { DashCoreSDK } from "dash-core-sdk";
import { config } from "./config.js";

let sdk: DashCoreSDK | null = null;

export function getSdk(): DashCoreSDK {
  if (sdk === null) {
    // DAPI_SEEDS may list several evonode gRPC-web URLs (comma-separated) for
    // resilience. Without it the SDK targets localhost:1443 and fails.
    const seeds = config.dapiSeeds
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    // The runtime accepts string | string[]; the published types only declare
    // string, so build options dynamically and cast.
    const options: { network: typeof config.network; dapiUrl?: string | string[] } = {
      network: config.network,
    };
    if (seeds.length === 1) options.dapiUrl = seeds[0];
    else if (seeds.length > 1) options.dapiUrl = seeds;
    sdk = new DashCoreSDK(options as ConstructorParameters<typeof DashCoreSDK>[0]);
  }
  return sdk;
}
