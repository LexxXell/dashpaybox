import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { scanBlockForAddresses } from "../src/sweeper.js";

const dir = dirname(fileURLToPath(import.meta.url));
const hexPath = join(dir, "fixtures", "testnet-block.hex");
const metaPath = join(dir, "fixtures", "testnet-block.json");
const have = existsSync(hexPath) && existsSync(metaPath);

// Validates the dashcore-lib block parser against a REAL testnet block (the
// reason this code exists: the SDK's Block.fromBytes crashes on Dash special
// txs). Skipped until the fixture is captured via scripts/capture-fixtures.ts.
test(
  "scanBlockForAddresses finds a known output in a real testnet block",
  { skip: have ? false : "no block fixture — run: node --import tsx scripts/capture-fixtures.ts" },
  () => {
    const raw = Uint8Array.from(Buffer.from(readFileSync(hexPath, "utf8").trim(), "hex"));
    const meta = JSON.parse(readFileSync(metaPath, "utf8")) as {
      hit: { address: string; txid: string; satoshis: number };
    };

    const hits = scanBlockForAddresses(raw, new Set([meta.hit.address]));
    const match = hits.find((h) => h.txid === meta.hit.txid && h.address === meta.hit.address);
    assert.ok(match, "known address found in the parsed block");
    assert.equal(match!.satoshis, meta.hit.satoshis);

    // Parsing the real block (special txs included) did not throw, and an empty
    // target set yields no hits.
    assert.equal(scanBlockForAddresses(raw, new Set()).length, 0);
  },
);
