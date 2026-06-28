// Outbound HTTP that ALWAYS verifies TLS, independent of the insecure global
// undici dispatcher that the DAPI gRPC-web transport requires (it routes via
// `globalThis.fetch`, so we cannot scope cert-skipping to it alone). Every call
// to a non-evonode host (oracle, webhook, node discovery) MUST go through this
// helper so nothing silently inherits the insecure global default.
import { Agent, fetch } from "undici";

type FetchInit = NonNullable<Parameters<typeof fetch>[1]>;

export const secureDispatcher = new Agent();
const DEFAULT_TIMEOUT_MS = 15_000;

export function secureFetch(url: string, init: FetchInit = {}): ReturnType<typeof fetch> {
  return fetch(url, {
    ...init,
    dispatcher: secureDispatcher,
    signal: init.signal ?? AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
  });
}
