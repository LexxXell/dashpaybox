import { test } from "node:test";
import assert from "node:assert/strict";
import { minorPerMajor, CachingRateProvider, type RateProvider } from "../src/oracle.js";

test("minorPerMajor maps ISO 4217 exponents", () => {
  assert.equal(minorPerMajor("USD"), 100);
  assert.equal(minorPerMajor("EUR"), 100);
  assert.equal(minorPerMajor("JPY"), 1); // 0 decimals
  assert.equal(minorPerMajor("jpy"), 1); // case-insensitive
  assert.equal(minorPerMajor("BHD"), 1000); // 3 decimals
  assert.equal(minorPerMajor("ZZZ"), 100); // unknown -> default 2
});

function fakeProvider() {
  return {
    source: "fake",
    calls: 0,
    fail: false,
    async priceOf(): Promise<number> {
      this.calls++;
      if (this.fail) throw new Error("upstream down");
      return 100;
    },
  };
}

test("CachingRateProvider caches within TTL", async (t) => {
  t.mock.timers.enable({ apis: ["Date"] });
  const inner = fakeProvider();
  const p = new CachingRateProvider(inner as unknown as RateProvider, 1000, 5000);

  assert.equal(await p.priceOf("usd"), 100);
  assert.equal(inner.calls, 1);
  t.mock.timers.tick(500); // within TTL
  assert.equal(await p.priceOf("usd"), 100);
  assert.equal(inner.calls, 1, "served from cache");
});

test("CachingRateProvider serves stale within maxStale, then fails", async (t) => {
  t.mock.timers.enable({ apis: ["Date"] });
  const inner = fakeProvider();
  const p = new CachingRateProvider(inner as unknown as RateProvider, 1000, 5000);

  await p.priceOf("usd"); // cache at t=0
  inner.fail = true;

  t.mock.timers.tick(2000); // past TTL, within maxStale (age 2000 < 5000)
  assert.equal(await p.priceOf("usd"), 100, "stale fallback");

  t.mock.timers.tick(4000); // age 6000 > maxStale
  await assert.rejects(() => p.priceOf("usd"), /upstream down/);
});
