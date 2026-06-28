// Read received amounts and sweep settled funds to OWNER_STORAGE_ADDRESS.
//
// Sweeping builds/signs a 1-in/1-out tx from the one-time address to the owner
// address and broadcasts it via DAPI.
import pkg from "@dashevo/dashcore-lib";
import type { DashCoreSDK } from "dash-core-sdk";
import { config } from "./config.js";
import { getSdk } from "./dash.js";
import type { Intent } from "./db.js";
import { decrypt } from "./wallet.js";

// The chain access sweeping needs. Defaulting to getSdk() keeps prod callers
// unchanged while letting tests inject a fake (fixture in, broadcast captured).
type TxSource = Pick<DashCoreSDK, "getTransaction" | "broadcastTransaction">;

// dashcore-lib ships loose typings; treat as dynamic.
const dashcore = pkg as unknown as {
  Transaction: new (raw?: string) => DashTx;
  PrivateKey: new (wif: string, network: unknown) => unknown;
  Block: new (raw: Buffer) => { transactions: DashTx[] };
  Networks: { livenet: unknown; testnet: unknown };
};

interface DashOutput {
  satoshis: number;
  script: { toAddress: (n: unknown) => { toString: () => string }; toHex: () => string };
}
interface DashTx {
  hash: string;
  outputs: DashOutput[];
  from: (utxo: unknown | unknown[]) => DashTx;
  to: (addr: string, sats: number) => DashTx;
  fee: (sats: number) => DashTx;
  sign: (key: unknown) => DashTx;
  toBuffer: () => Buffer;
}

export interface BlockHit {
  address: string;
  txid: string;
  satoshis: number;
}

/** Parse a raw block (Dash special txs included) and find outputs to `addresses`. */
export function scanBlockForAddresses(rawBlock: Uint8Array, addresses: Set<string>): BlockHit[] {
  const block = new dashcore.Block(Buffer.from(rawBlock));
  const hits: BlockHit[] = [];
  for (const tx of block.transactions) {
    for (const out of tx.outputs) {
      const addr = outputAddress(out);
      if (addr && addresses.has(addr)) {
        hits.push({ address: addr, txid: tx.hash, satoshis: out.satoshis });
      }
    }
  }
  return hits;
}

const network = config.network === "mainnet" ? dashcore.Networks.livenet : dashcore.Networks.testnet;
const SWEEP_FEE_DUFFS = 1000; // generous for a 1-in/1-out tx

function outputAddress(out: DashOutput): string {
  try {
    return out.script.toAddress(network).toString();
  } catch {
    return "";
  }
}

async function loadTx(txid: string, sdk: TxSource): Promise<DashTx> {
  const dapiTx = await sdk.getTransaction(txid);
  return new dashcore.Transaction(Buffer.from(dapiTx.transaction).toString("hex"));
}

/** Total duffs paid to `address` across a transaction's outputs. */
export async function receivedDuffs(
  txid: string,
  address: string,
  sdk: TxSource = getSdk(),
): Promise<number> {
  const tx = await loadTx(txid, sdk);
  return tx.outputs
    .filter((out) => outputAddress(out) === address)
    .reduce((sum, out) => sum + out.satoshis, 0);
}

export async function sweep(intent: Intent, sdk: TxSource = getSdk()): Promise<string> {
  if (!intent.txid) throw new Error("sweep: intent has no txid");
  const tx = await loadTx(intent.txid, sdk);

  interface Utxo {
    txId: string;
    outputIndex: number;
    address: string;
    script: string;
    satoshis: number;
  }
  // Spend EVERY output paying the one-time address, not just the first: a single
  // funding tx may carry multiple outputs to it, and leaving any behind strands
  // funds on a hot key forever.
  const utxos: Utxo[] = [];
  for (let i = 0; i < tx.outputs.length; i++) {
    const out = tx.outputs[i];
    if (outputAddress(out) === intent.address) {
      utxos.push({
        txId: intent.txid,
        outputIndex: i,
        address: intent.address,
        script: out.script.toHex(),
        satoshis: out.satoshis,
      });
    }
  }
  if (utxos.length === 0) throw new Error("sweep: no output paying the one-time address");

  const sats = utxos.reduce((sum, u) => sum + u.satoshis, 0);
  if (sats < config.minSweepDuffs) {
    throw new Error(`sweep: ${sats} duffs below minimum ${config.minSweepDuffs} — left for manual handling`);
  }

  const priv = new dashcore.PrivateKey(decrypt(intent.enc_privkey), network);
  const sweepTx = new dashcore.Transaction()
    .from(utxos)
    .to(config.ownerStorageAddress, sats - SWEEP_FEE_DUFFS)
    .fee(SWEEP_FEE_DUFFS)
    .sign(priv);

  await sdk.broadcastTransaction(new Uint8Array(sweepTx.toBuffer()));
  return sweepTx.hash;
}
