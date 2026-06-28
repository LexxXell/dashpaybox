import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { buildServer } from "../src/server.js";

const AUTH = process.env.AUTH_SECRET as string;
let app: ReturnType<typeof buildServer>;

before(async () => {
  app = buildServer();
  await app.ready();
});
after(async () => {
  await app.close();
});

test("GET /health is public and reports ok", async () => {
  const res = await app.inject({ method: "GET", url: "/health" });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().ok, true);
});

test("GET /version is public", async () => {
  const res = await app.inject({ method: "GET", url: "/version" });
  assert.equal(res.statusCode, 200);
});

test("POST /quote without auth -> 401", async () => {
  const res = await app.inject({
    method: "POST",
    url: "/quote",
    payload: { amount_minor: 1000, currency: "USD" },
  });
  assert.equal(res.statusCode, 401);
});

test("POST /quote with auth but missing currency -> 400", async () => {
  const res = await app.inject({
    method: "POST",
    url: "/quote",
    headers: { "x-dash-auth": AUTH },
    payload: { amount_minor: 1000 },
  });
  assert.equal(res.statusCode, 400);
});

test("POST /quote rejects non-positive amount -> 400", async () => {
  const res = await app.inject({
    method: "POST",
    url: "/quote",
    headers: { "x-dash-auth": AUTH },
    payload: { amount_minor: -5, currency: "USD" },
  });
  assert.equal(res.statusCode, 400);
});

test("POST /quote rejects a non-ISO currency -> 400", async () => {
  const res = await app.inject({
    method: "POST",
    url: "/quote",
    headers: { "x-dash-auth": AUTH },
    payload: { amount_minor: 1000, currency: "DOLLARS" },
  });
  assert.equal(res.statusCode, 400);
});

test("POST /intents without order_id -> 400", async () => {
  const res = await app.inject({
    method: "POST",
    url: "/intents",
    headers: { "x-dash-auth": AUTH },
    payload: { amount_minor: 1000, currency: "USD" },
  });
  assert.equal(res.statusCode, 400);
});

test("GET /intents/:id for unknown id -> 404", async () => {
  const res = await app.inject({
    method: "GET",
    url: "/intents/does-not-exist",
    headers: { "x-dash-auth": AUTH },
  });
  assert.equal(res.statusCode, 404);
});
