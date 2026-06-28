// Create a payment intent (TypeScript).
//   DASH_AUTH_SECRET=... npx tsx examples/typescript/create-intent.ts
export {}; // make this file a module (enables top-level await)
const SERVICE = process.env.DASH_SERVICE_URL ?? "http://localhost:8090";
const AUTH = process.env.DASH_AUTH_SECRET ?? "change-me";

interface IntentResponse {
  intent_id: string;
  address: string;
  duffs: number;
  amount: string;
  rate: number;
  rate_source: string;
  uri: string;
  expires_at: string;
}

const res = await fetch(`${SERVICE}/intents`, {
  method: "POST",
  headers: { "content-type": "application/json", "X-Dash-Auth": AUTH },
  body: JSON.stringify({ order_id: "order-123", amount_minor: 1000, currency: "USD" }),
});
if (!res.ok) throw new Error(`intent failed: HTTP ${res.status}`);

const intent = (await res.json()) as IntentResponse;
console.log("Pay to:", intent.address);
console.log("URI (QR):", intent.uri);
// Persist intent.intent_id against your order; the webhook will reference it.
