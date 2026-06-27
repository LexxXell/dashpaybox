// Sweep settled funds from a one-time address to OWNER_STORAGE_ADDRESS.
//
// Fetches the received tx, locates the output paying the one-time address, then
// builds/signs a 1-in/1-out tx to the owner address and broadcasts it.
import pkg from "@dashevo/dashcore-lib";
import { config } from "./config.js";
import { getSdk } from "./dash.js";
import type { Intent } from "./db.js";
import { decrypt } from "./wallet.js";

// dashcore-lib ships loose typings; treat as dynamic.
const dashcore = pkg as unknown as {
  Transaction: new (raw?: string) => DashTx;
  PrivateKey: new (wif: string, network: unknown) => unknown;
  Networks: { livenet: unknown; testnet: unknown };
};

interface DashOutput {
  satoshis: number;
  script: { toAddress: (n: unknown) => { toString: () => string }; toHex: () => string };
}
interface DashTx {
  outputs: DashOutput[];
  hash: string;
  from: (utxo: unknown) => DashTx;
  to: (addr: string, sats: number) => DashTx;
  fee: (sats: number) => DashTx;
  sign: (key: unknown) => DashTx;
  toBuffer: () => Buffer;
}

const network = config.network === "mainnet" ? dashcore.Networks.livenet : dashcore.Networks.testnet;
const SWEEP_FEE_DUFFS = 1000; // generous for a 1-in/1-out tx

export async function sweep(intent: Intent): Promise<string> {
  if (!intent.txid) throw new Error("sweep: intent has no txid");
  const sdk = getSdk();
  const dapiTx = await sdk.getTransaction(intent.txid);
  const tx = new dashcore.Transaction(Buffer.from(dapiTx.transaction).toString("hex"));

  interface Utxo {
    txId: string;
    outputIndex: number;
    address: string;
    script: string;
    satoshis: number;
  }
  let utxo: Utxo | null = null;
  for (let i = 0; i < tx.outputs.length; i++) {
    const out = tx.outputs[i];
    let addr = "";
    try {
      addr = out.script.toAddress(network).toString();
    } catch {
      addr = "";
    }
    if (addr === intent.address) {
      utxo = {
        txId: intent.txid,
        outputIndex: i,
        address: intent.address,
        script: out.script.toHex(),
        satoshis: out.satoshis,
      };
      break;
    }
  }
  if (utxo === null) throw new Error("sweep: no output paying the one-time address");

  const sats = utxo.satoshis;
  const priv = new dashcore.PrivateKey(decrypt(intent.enc_privkey), network);
  const sweepTx = new dashcore.Transaction()
    .from(utxo)
    .to(config.ownerStorageAddress, sats - SWEEP_FEE_DUFFS)
    .fee(SWEEP_FEE_DUFFS)
    .sign(priv);

  await sdk.broadcastTransaction(new Uint8Array(sweepTx.toBuffer()));
  return sweepTx.hash;
}
