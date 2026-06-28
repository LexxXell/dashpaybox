import { test } from "node:test";
import assert from "node:assert/strict";
import pkg from "@dashevo/dashcore-lib";
import { encrypt, decrypt, createOneTimeKey } from "../src/wallet.js";

const dashcore = pkg as unknown as {
  PrivateKey: new (wif: string, network?: unknown) => { toAddress: (n?: unknown) => { toString: () => string } };
  Networks: { testnet: unknown };
};

test("encrypt/decrypt round trip", () => {
  const wif = "cVjzvdHGfQDtBEq7oddDRpwjP9cVfFsHU8nDjuD4f3xqLY1234ab";
  const blob = encrypt(wif);
  assert.notEqual(blob, wif);
  assert.equal(blob.split(":").length, 3, "blob is iv:tag:ciphertext");
  assert.equal(decrypt(blob), wif);
});

test("encrypt uses a fresh IV each call (ciphertext differs)", () => {
  const a = encrypt("same-secret");
  const b = encrypt("same-secret");
  assert.notEqual(a, b);
  assert.equal(decrypt(a), decrypt(b));
});

test("decrypt rejects a tampered blob (GCM auth)", () => {
  const blob = encrypt("tamper-me");
  const [iv, tag, ct] = blob.split(":");
  const flip = Buffer.from(ct, "base64");
  flip[0] ^= 0xff;
  const bad = [iv, tag, flip.toString("base64")].join(":");
  assert.throws(() => decrypt(bad));
});

test("createOneTimeKey yields a testnet address whose key decrypts and re-derives it", () => {
  const { address, encPrivKey } = createOneTimeKey();
  assert.match(address, /^y/, "testnet P2PKH addresses start with 'y'");
  const wif = decrypt(encPrivKey);
  const rederived = new dashcore.PrivateKey(wif, dashcore.Networks.testnet)
    .toAddress(dashcore.Networks.testnet)
    .toString();
  assert.equal(rederived, address);
});
