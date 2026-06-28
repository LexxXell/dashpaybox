// HTTP API for the backend: quote, create intent, read intent status.
import Fastify from "fastify";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { config } from "./config.js";
import { getIntent, insertIntent, listOpenIntents, type Intent } from "./db.js";
import { quote } from "./oracle.js";
import { watchIntent } from "./watcher.js";
import { createOneTimeKey } from "./wallet.js";

function authOk(header?: string): boolean {
  if (!header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(config.authSecret);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Lightweight in-memory fixed-window rate limiter (per client IP). The API is
// backend↔service, so this is a guardrail against a leaked secret or a buggy
// caller hammering the service, not a public-facing DDoS defense.
const rlWindowMs = config.rateLimitWindowSeconds * 1000;
const rlHits = new Map<string, { count: number; resetAt: number }>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  if (rlHits.size > 10_000) for (const [k, w] of rlHits) if (now > w.resetAt) rlHits.delete(k);
  const w = rlHits.get(ip);
  if (!w || now > w.resetAt) {
    rlHits.set(ip, { count: 1, resetAt: now + rlWindowMs });
    return false;
  }
  w.count++;
  return w.count > config.rateLimitMax;
}

const amountMinor = { type: "integer", minimum: 1, maximum: 1_000_000_000_000 } as const;
const currency = { type: "string", pattern: "^[A-Za-z]{3}$" } as const;

const quoteSchema = {
  body: {
    type: "object",
    required: ["amount_minor", "currency"],
    additionalProperties: false,
    properties: { amount_minor: amountMinor, currency },
  },
};
const intentSchema = {
  body: {
    type: "object",
    required: ["order_id", "amount_minor", "currency"],
    additionalProperties: false,
    properties: {
      order_id: { type: "string", minLength: 1, maxLength: 200 },
      amount_minor: amountMinor,
      currency,
      instant_send: { type: "boolean" },
      min_confirmations: { type: "integer", minimum: 0, maximum: 100 },
    },
  },
};

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

  // Rate-limit + auth at onRequest (before body validation), so an
  // unauthenticated caller can't even reach schema validation.
  app.addHook("onRequest", async (req, reply) => {
    if (req.url === "/health" || req.url === "/version") return;
    if (rateLimited(req.ip)) {
      return reply.code(429).send({ ok: false, error: "rate_limited" });
    }
    if (!authOk(req.headers["x-dash-auth"] as string | undefined)) {
      return reply.code(401).send({ ok: false, error: "unauthorized" });
    }
  });

  app.get("/health", async () => ({ ok: true, network: config.network, version: config.version }));
  app.get("/version", async () => ({ name: "dash-pay", version: config.version }));

  app.post("/quote", { schema: quoteSchema }, async (req) => {
    const { amount_minor, currency } = req.body as QuoteBody;
    const q = await quote(amount_minor, currency);
    return { duffs: q.duffs, amount: q.amount, rate: q.rate, rate_source: q.rate_source };
  });

  app.post("/intents", { schema: intentSchema }, async (req, reply) => {
    if (listOpenIntents().length >= config.maxOpenIntents) {
      return reply.code(429).send({ ok: false, error: "too_many_open_intents" });
    }
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
