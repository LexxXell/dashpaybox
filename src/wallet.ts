// One-time Dash key generation + at-rest encryption of private keys.
//
// Per the forwarding model: each payment intent gets a fresh keypair. The
// private key (WIF) is encrypted with KEYS_ENCRYPTION_SECRET and stored in the
// service DB; on settlement the sweeper decrypts it to forward funds to the
// fixed OWNER_STORAGE_ADDRESS (which is read from env, never the DB).
import dashcore from "@dashevo/dashcore-lib";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { config } from "./config.js";

const { PrivateKey, Networks } = dashcore;
const network = config.network === "mainnet" ? Networks.livenet : Networks.testnet;

function key32(): Buffer {
  return createHash("sha256").update(config.keysEncryptionSecret).digest();
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key32(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(":");
}

export function decrypt(blob: string): string {
  const [ivb, tagb, encb] = blob.split(":");
  const decipher = createDecipheriv("aes-256-gcm", key32(), Buffer.from(ivb, "base64"));
  decipher.setAuthTag(Buffer.from(tagb, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(encb, "base64")), decipher.final()]).toString(
    "utf8",
  );
}

export function createOneTimeKey(): { address: string; encPrivKey: string } {
  const pk = new PrivateKey(undefined, network);
  const address = pk.toAddress(network).toString();
  return { address, encPrivKey: encrypt(pk.toWIF()) };
}
