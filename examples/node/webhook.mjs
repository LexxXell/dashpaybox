// Minimal signed-webhook receiver (no dependencies).
//   DASH_CALLBACK_SECRET=... node examples/node/webhook.mjs
import http from "node:http";
import { createHmac, timingSafeEqual } from "node:crypto";

const CALLBACK_SECRET = process.env.DASH_CALLBACK_SECRET ?? "change-me";

function verify(raw, sig) {
  const expected = createHmac("sha256", CALLBACK_SECRET).update(raw).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(sig ?? "", "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

const seen = new Set(); // replace with durable storage; idempotency by (intent_id, event)

http
  .createServer((req, res) => {
    if (req.method !== "POST" || req.url !== "/webhooks/dash") return res.writeHead(404).end();
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks); // RAW bytes — verify BEFORE parsing
      if (!verify(raw, req.headers["x-dash-signature"])) return res.writeHead(401).end("bad signature");

      const e = JSON.parse(raw.toString("utf8"));
      const key = `${e.intent_id}:${e.event}`;
      if (seen.has(key)) return res.writeHead(200).end("ok"); // idempotent
      seen.add(key);

      switch (e.event) {
        case "confirmed":
          console.log(`order ${e.order_id}: PAID — grant access`); // overpayment still grants
          break;
        case "mismatch":
          console.log(`order ${e.order_id}: underpaid — do NOT grant`);
          break;
        case "late":
          console.log(`order ${e.order_id}: late, swept (${e.sweep_txid}) — refund out-of-band`);
          break;
        case "expired":
          console.log(`order ${e.order_id}: expired`);
          break;
      }
      res.writeHead(200).end("ok"); // 2xx so the service stops retrying
    });
  })
  .listen(3000, () => console.log("webhook listening on :3000 /webhooks/dash"));
