// Create a payment intent, then show intent.address / intent.uri to the customer.
//   node examples/node/create-intent.mjs
const SERVICE = process.env.DASH_SERVICE_URL ?? "http://localhost:8090";
const AUTH = process.env.DASH_AUTH_SECRET ?? "change-me";

const res = await fetch(`${SERVICE}/intents`, {
  method: "POST",
  headers: { "content-type": "application/json", "X-Dash-Auth": AUTH },
  body: JSON.stringify({ order_id: "order-123", amount_minor: 1000, currency: "USD" }),
});
if (!res.ok) throw new Error(`intent failed: HTTP ${res.status}`);

const intent = await res.json();
console.log("Pay to:", intent.address);
console.log("URI (QR):", intent.uri);
console.log("Expires:", intent.expires_at);
// Persist intent.intent_id against your order; the webhook will reference it.
