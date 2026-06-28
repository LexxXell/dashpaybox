// Signed-webhook receiver (TypeScript, Node std lib only).
//   DASH_CALLBACK_SECRET=... npx tsx examples/typescript/webhook.ts
import http from "node:http";
import { createHmac, timingSafeEqual } from "node:crypto";

const CALLBACK_SECRET = process.env.DASH_CALLBACK_SECRET ?? "change-me";

type DashEvent = "confirmed" | "mismatch" | "expired" | "late";
interface DashWebhook {
  event: DashEvent;
  intent_id: string;
  order_id: string;
  txid?: string;
  sweep_txid?: string;
  received_duffs?: number;
  expected_duffs: number;
  rate: number;
  rate_source: string;
  occurred_at: string;
}

function verify(raw: Buffer, sig: string | undefined): boolean {
  const expected = createHmac("sha256", CALLBACK_SECRET).update(raw).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(sig ?? "", "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

const seen = new Set<string>(); // idempotency by (intent_id, event) — use durable storage

http
  .createServer((req, res) => {
    if (req.method !== "POST" || req.url !== "/webhooks/dash") return res.writeHead(404).end();
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks); // RAW bytes — verify BEFORE parsing
      if (!verify(raw, req.headers["x-dash-signature"] as string | undefined)) {
        return res.writeHead(401).end("bad signature");
      }
      const e = JSON.parse(raw.toString("utf8")) as DashWebhook;
      const key = `${e.intent_id}:${e.event}`;
      if (seen.has(key)) return res.writeHead(200).end("ok");
      seen.add(key);

      switch (e.event) {
        case "confirmed":
          // grant access (received_duffs > expected_duffs => overpayment, still granted)
          break;
        case "mismatch":
          // underpayment — do NOT grant
          break;
        case "late":
          // paid after expiry; funds swept to cold (e.sweep_txid) — refund out-of-band
          break;
        case "expired":
          break;
      }
      res.writeHead(200).end("ok");
    });
  })
  .listen(3000, () => console.log("webhook listening on :3000"));
