import { test } from "node:test";
import assert from "node:assert/strict";
import pkg from "@dashevo/dashcore-lib";
import { config } from "../src/config.js";
import { receivedDuffs, sweep } from "../src/sweeper.js";
import { createOneTimeKey } from "../src/wallet.js";
import type { Intent } from "../src/db.js";

// dashcore-lib ships loose typings; treat as dynamic in tests.
const dashcore = pkg as any;
const { Transaction, PrivateKey, Networks, Script } = dashcore;
const NET = Networks.testnet;

// Build a real-format funding tx (unsigned dummy input + the given outputs) and
// a fake SDK that serves it as getTransaction and captures any broadcast.
function fundingWith(outputs: Array<{ address: string; sats: number }>) {
  const dummyKey = new PrivateKey(undefined, NET);
  const dummyUtxo = {
    txId: "a".repeat(64),
    outputIndex: 0,
    script: Script.buildPublicKeyHashOut(dummyKey.toAddress(NET)).toHex(),
    satoshis: 100_000_000,
  };
  const tx = new Transaction().from(dummyUtxo);
  for (const o of outputs) tx.to(o.address, o.sats);
  const rawHex: string = tx.toString(); // uncheckedSerialize (skip fee checks)
  return { txid: tx.hash as string, raw: Buffer.from(rawHex, "hex") };
}

function fakeSdk(raw: Buffer) {
  const calls: Uint8Array[] = [];
  return {
    sdk: {
      async getTransaction() {
        return { transaction: raw } as never;
      },
      async broadcastTransaction(bytes: Uint8Array) {
        calls.push(bytes);
        return "broadcast-ack" as never;
      },
    },
    broadcasts: calls,
  };
}

function intentFor(address: string, encPrivKey: string, txid: string): Intent {
  return {
    id: "intent-1",
    order_id: "order-1",
    address,
    enc_privkey: encPrivKey,
    expected_duffs: 1,
    amount_minor: 1,
    currency: "USD",
    rate: 1,
    rate_source: "test",
    instant_send: 1,
    min_confirmations: 1,
    status: "confirmed",
    received_duffs: null,
    txid,
    sweep_txid: null,
    created_at: new Date().toISOString(),
    expires_at: new Date().toISOString(),
  };
}

test("receivedDuffs sums every output paying the address (H1)", async () => {
  const { address } = createOneTimeKey();
  const { txid, raw } = fundingWith([
    { address, sats: 5_000_000 },
    { address, sats: 3_000_000 },
  ]);
  const { sdk } = fakeSdk(raw);
  assert.equal(await receivedDuffs(txid, address, sdk as never), 8_000_000);
});

test("sweep spends ALL matching outputs to the owner address (H1)", async () => {
  const { address, encPrivKey } = createOneTimeKey();
  const { txid, raw } = fundingWith([
    { address, sats: 5_000_000 },
    { address, sats: 3_000_000 },
    { address: new PrivateKey(undefined, NET).toAddress(NET).toString(), sats: 1_000_000 }, // unrelated
  ]);
  const { sdk, broadcasts } = fakeSdk(raw);

  const hash = await sweep(intentFor(address, encPrivKey, txid), sdk as never);
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.equal(broadcasts.length, 1, "exactly one broadcast");

  const swept = new Transaction(Buffer.from(broadcasts[0]).toString("hex"));
  assert.equal(swept.inputs.length, 2, "both matching outputs spent");
  assert.equal(swept.outputs.length, 1, "single consolidating output");
  assert.equal(swept.outputs[0].satoshis, 8_000_000 - 1000, "total minus sweep fee");
  assert.equal(swept.outputs[0].script.toAddress(NET).toString(), config.ownerStorageAddress);
  for (const inp of swept.inputs) {
    assert.ok(inp.script.toBuffer().length > 0, "input is signed");
  }
});

test("sweep refuses amounts below the minimum (H3)", async () => {
  const { address, encPrivKey } = createOneTimeKey();
  const { txid, raw } = fundingWith([{ address, sats: 8_000 }]); // < MIN_SWEEP_DUFFS (10000)
  const { sdk } = fakeSdk(raw);
  await assert.rejects(() => sweep(intentFor(address, encPrivKey, txid), sdk as never), /below minimum/);
});

test("sweep throws when no output pays the one-time address", async () => {
  const { address, encPrivKey } = createOneTimeKey();
  const other = new PrivateKey(undefined, NET).toAddress(NET).toString();
  const { txid, raw } = fundingWith([{ address: other, sats: 5_000_000 }]);
  const { sdk } = fakeSdk(raw);
  await assert.rejects(
    () => sweep(intentFor(address, encPrivKey, txid), sdk as never),
    /no output paying/,
  );
});
