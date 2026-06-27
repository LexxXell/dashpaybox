// HTTP API for the backend: quote, create intent, read intent status.
import Fastify from "fastify";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { config } from "./config.js";
import { getIntent, insertIntent, type Intent } from "./db.js";
import { quote } from "./oracle.js";
import { watchIntent } from "./watcher.js";
import { createOneTimeKey } from "./wallet.js";

function authOk(header?: string): boolean {
  if (!header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(config.authSecret);
  return a.length === b.length && timingSafeEqual(a, b);
}

interface QuoteBody {
  amount_minor: number;
  currency: string;
}
interface IntentBody extends QuoteBody {
  order_id: string;
  instant_send?: boolean;
  min_confirmations?: number;
}

export function buildServer() {
  const app = Fastify({ logger: true });

  app.addHook("preHandler", async (req, reply) => {
    if (req.url === "/health") return;
    if (!authOk(req.headers["x-dash-auth"] as string | undefined)) {
      reply.code(401).send({ ok: false, error: "unauthorized" });
    }
  });

  app.get("/health", async () => ({ ok: true, network: config.network }));

  app.post("/quote", async (req) => {
    const { amount_minor, currency } = req.body as QuoteBody;
    const q = await quote(amount_minor, currency);
    return { duffs: q.duffs, amount: q.amount, rate: q.rate, rate_source: q.rate_source };
  });

  app.post("/intents", async (req) => {
    const b = req.body as IntentBody;
    const q = await quote(b.amount_minor, b.currency);
    const { address, encPrivKey } = createOneTimeKey();
    const now = new Date();
    const expires = new Date(now.getTime() + config.paymentWindowSeconds * 1000);
    const intent: Intent = {
      id: randomUUID(),
      order_id: b.order_id,
      address,
      enc_privkey: encPrivKey,
      expected_duffs: q.duffs,
      amount_minor: b.amount_minor,
      currency: b.currency,
      rate: q.rate,
      rate_source: q.rate_source,
      instant_send: (b.instant_send ?? config.defaultInstantSend) ? 1 : 0,
      min_confirmations: b.min_confirmations ?? config.defaultMinConfirmations,
      status: "pending",
      received_duffs: null,
      txid: null,
      sweep_txid: null,
      created_at: now.toISOString(),
      expires_at: expires.toISOString(),
    };
    insertIntent(intent);
    watchIntent(intent);
    return {
      intent_id: intent.id,
      address,
      duffs: q.duffs,
      amount: q.amount,
      rate: q.rate,
      rate_source: q.rate_source,
      uri: `dash:${address}?amount=${q.amount}`,
      expires_at: intent.expires_at,
    };
  });

  app.get("/intents/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const i = getIntent(id);
    if (!i) return reply.code(404).send({ ok: false });
    return {
      intent_id: i.id,
      status: i.status,
      address: i.address,
      duffs: i.expected_duffs,
      received_duffs: i.received_duffs ?? undefined,
      txid: i.txid ?? undefined,
      sweep_txid: i.sweep_txid ?? undefined,
    };
  });

  return app;
}
