// Capture a real testnet block as a test fixture for scanBlockForAddresses.
//
//   node --import tsx scripts/capture-fixtures.ts
//
// Writes tests/fixtures/testnet-block.hex (raw block) and testnet-block.json
// (a known {address, txid, satoshis} hit to assert against). Run once and commit
// the result; the scanblock test stays skipped until the fixture exists.
process.env.NETWORK ??= "testnet";
process.env.AUTH_SECRET ??= "capture";
process.env.CALLBACK_URL ??= "https://example.test/webhook";
process.env.CALLBACK_SECRET ??= "capture";
process.env.OWNER_STORAGE_ADDRESS ??= "yZGgsDcXVkque9ozQCEJgrDNSSjkkPg4DB";
process.env.KEYS_ENCRYPTION_SECRET ??= "capture";

import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, "..", "tests", "fixtures");

const { initDash, getSdk } = await import("../src/dash.js");
const pkg = (await import("@dashevo/dashcore-lib")).default as any;
const NET = pkg.Networks.testnet;

await initDash();
const sdk = getSdk();
const tip = (await sdk.getBestBlockHeight()).height;
console.log(`tip height ${tip}`);

let chosen:
  | { height: number; hash: string; raw: Uint8Array; hit: { address: string; txid: string; satoshis: number } }
  | undefined;

for (let h = tip; h > tip - 60 && !chosen; h--) {
  let raw: Uint8Array;
  try {
    raw = (await sdk.getBlock({ height: h })).block;
  } catch (e) {
    console.warn(`block ${h} fetch failed: ${(e as Error).message}`);
    continue;
  }
  const block = new pkg.Block(Buffer.from(raw));
  for (const tx of block.transactions) {
    for (const out of tx.outputs) {
      let addr = "";
      try {
        addr = out.script.toAddress(NET).toString();
      } catch {
        addr = "";
      }
      if (addr) {
        chosen = { height: h, hash: block.hash, raw, hit: { address: addr, txid: tx.hash, satoshis: out.satoshis } };
        break;
      }
    }
    if (chosen) break;
  }
}

if (!chosen) {
  console.error("no suitable block/output found");
  process.exit(1);
}

mkdirSync(fixturesDir, { recursive: true });
writeFileSync(join(fixturesDir, "testnet-block.hex"), Buffer.from(chosen.raw).toString("hex"));
writeFileSync(
  join(fixturesDir, "testnet-block.json"),
  JSON.stringify({ height: chosen.height, hash: chosen.hash, hit: chosen.hit }, null, 2) + "\n",
);
console.log(`captured block ${chosen.height} (${chosen.hash}) hit:`, chosen.hit);
process.exit(0);
