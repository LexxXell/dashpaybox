// Fiat→DASH rate via a pluggable oracle, with a short cache window.
import { config } from "./config.js";
import { secureFetch } from "./http.js";

export interface Quote {
  duffs: number; // amount in duffs (1 DASH = 1e8 duffs)
  amount: string; // human DASH amount, 8 dp
  rate: number; // price of 1 DASH in the fiat currency
  rate_source: string;
}

export interface RateProvider {
  readonly source: string;
  // Price of 1 DASH in the given fiat currency (e.g. "RUB").
  priceOf(currency: string): Promise<number>;
}

const DUFFS_PER_DASH = 100_000_000;

// Number of minor units per major unit, by ISO 4217 exponent. Most currencies
// use 2 decimals; these are the exceptions. Default is 2.
const MINOR_EXPONENT: Record<string, number> = {
  JPY: 0, KRW: 0, VND: 0, CLP: 0, ISK: 0, HUF: 0, TWD: 0, UGX: 0, XAF: 0, XOF: 0,
  BHD: 3, KWD: 3, OMR: 3, JOD: 3, TND: 3, IQD: 3, LYD: 3,
};

function minorPerMajor(currency: string): number {
  return 10 ** (MINOR_EXPONENT[currency.toUpperCase()] ?? 2);
}

class CoinGeckoRateProvider implements RateProvider {
  readonly source = "coingecko";

  async priceOf(currency: string): Promise<number> {
    const vs = currency.toLowerCase();
    const url = `${config.coingeckoUrl}/simple/price?ids=${config.coingeckoDashId}&vs_currencies=${vs}`;
    const headers: Record<string, string> = {};
    if (config.coingeckoApiKey) headers["x-cg-demo-api-key"] = config.coingeckoApiKey;
    const res = await secureFetch(url, { headers });
    if (!res.ok) throw new Error(`coingecko ${res.status}`);
    const data = (await res.json()) as Record<string, Record<string, number>>;
    const price = data?.[config.coingeckoDashId]?.[vs];
    if (!price || price <= 0) throw new Error(`coingecko: no price for ${currency}`);
    return price;
  }
}

// Cache the rate per currency for a short window to smooth bursts / outages.
// On upstream failure a cached value is served only while it is younger than
// `maxStaleMs`; beyond that the quote fails rather than pricing on a stale rate.
class CachingRateProvider implements RateProvider {
  private cache = new Map<string, { price: number; at: number }>();
  constructor(private inner: RateProvider, private ttlMs: number, private maxStaleMs: number) {}
  get source() {
    return this.inner.source;
  }
  async priceOf(currency: string): Promise<number> {
    const key = currency.toLowerCase();
    const hit = this.cache.get(key);
    const now = Date.now();
    if (hit && now - hit.at < this.ttlMs) return hit.price;
    try {
      const price = await this.inner.priceOf(currency);
      this.cache.set(key, { price, at: now });
      return price;
    } catch (err) {
      if (hit && now - hit.at < this.maxStaleMs) return hit.price; // bounded stale fallback
      throw err;
    }
  }
}

export const rateProvider: RateProvider = new CachingRateProvider(
  new CoinGeckoRateProvider(),
  config.rateCacheTtlSeconds * 1000,
  config.rateMaxStaleSeconds * 1000,
);

export async function quote(amountMinor: number, currency: string): Promise<Quote> {
  const rate = await rateProvider.priceOf(currency);
  const dash = amountMinor / minorPerMajor(currency) / rate;
  const duffs = Math.round(dash * DUFFS_PER_DASH);
  return {
    duffs,
    amount: (duffs / DUFFS_PER_DASH).toFixed(8),
    rate,
    rate_source: rateProvider.source,
  };
}
