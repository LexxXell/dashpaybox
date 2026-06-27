// HMAC-signed callbacks to the backend's /payments/dash webhook.
import { createHmac } from "node:crypto";
import { config } from "./config.js";
import type { Intent } from "./db.js";

export type CallbackEvent = "confirmed" | "expired" | "mismatch";

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
  try {
    const res = await fetch(config.callbackUrl, {
      method: "POST",
      headers: { "content-type": "application/json", "X-Dash-Signature": sig },
      body,
    });
    return res.ok;
  } catch {
    return false;
  }
}
