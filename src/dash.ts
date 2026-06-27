// Dash network client (DAPI gRPC via dash-core-sdk): payment detection +
// transaction broadcast. Lazily constructed singleton.
import { DashCoreSDK } from "dash-core-sdk";
import { config } from "./config.js";

let sdk: DashCoreSDK | null = null;

export function getSdk(): DashCoreSDK {
  if (sdk === null) {
    sdk = new DashCoreSDK({
      network: config.network,
      ...(config.dapiSeeds ? { dapiUrl: config.dapiSeeds } : {}),
    });
  }
  return sdk;
}
