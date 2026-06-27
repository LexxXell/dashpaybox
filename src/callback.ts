// HMAC-signed callbacks to the integrator's webhook, with retry + backoff.
import { createHmac } from "node:crypto";
import { fetch } from "undici";
import { config } from "./config.js";
import { secureDispatcher } from "./dash.js";
import type { Intent } from "./db.js";

export type CallbackEvent = "confirmed" | "expired" | "mismatch";

// Backoff schedule (seconds) between delivery attempts.
const RETRY_DELAYS_SEC = [0, 2, 5, 15, 60, 300];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function sendCallback(event: CallbackEvent, intent: Intent): Promise<boolean> {
  const body = JSON.stringify({
    event,
    intent_id: intent.id,
    order_id: intent.order_id,
    txid: intent.txid ?? undefined,
    received_duffs: intent.received_duffs ?? undefined,
    expected_duffs: intent.expected_duffs,
    rate: intent.rate,
    rate_source: intent.rate_source,
    occurred_at: new Date().toISOString(),
  });
  const sig = createHmac("sha256", config.callbackSecret).update(body).digest("hex");

  for (let attempt = 0; attempt < RETRY_DELAYS_SEC.length; attempt++) {
    if (RETRY_DELAYS_SEC[attempt] > 0) await sleep(RETRY_DELAYS_SEC[attempt] * 1000);
    try {
      const res = await fetch(config.callbackUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "X-Dash-Signature": sig,
          "X-Dash-Event": event,
        },
        body,
        dispatcher: secureDispatcher,
        signal: AbortSignal.timeout(15_000),
      });
      if (res.ok) return true;
      console.error(`callback ${event} for ${intent.id}: HTTP ${res.status} (attempt ${attempt + 1})`);
    } catch (err) {
      console.error(`callback ${event} for ${intent.id} failed (attempt ${attempt + 1}):`, err);
    }
  }
  return false;
}
