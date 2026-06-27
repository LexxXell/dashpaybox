// Chain watcher: detect incoming payments and settle intents.
//
// Two detection paths feed one settlement routine:
//   - live: `waitForPayment` (mempool + new blocks) while the service runs;
//   - startup reconcile: scan the last N blocks for payments that arrived while
//     the service was down (the live subscription can't replay past blocks).
import { Block, DashCoreSDK } from "dash-core-sdk";
import { config } from "./config.js";
import { getSdk } from "./dash.js";
import { getIntent, listOpenIntents, updateIntent, type Intent } from "./db.js";
import { sendCallback } from "./callback.js";
import { receivedDuffs, sweep } from "./sweeper.js";

const watching = new Set<string>();
const settling = new Set<string>();
const TERMINAL = new Set(["confirmed", "swept", "mismatch"]);
const NET = config.network === "mainnet" ? 0 : 1; // dash-core-sdk Network enum
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Block until the payment reaches finality per the intent's policy:
// InstantSend (when enabled) or `min_confirmations` block confirmations; a
// ChainLock always counts as final.
async function awaitFinality(sdk: DashCoreSDK, txid: string, intent: Intent): Promise<void> {
  const minConf = intent.instant_send === 0 ? Math.max(1, intent.min_confirmations) : 1;
  for (let i = 0; i < 240; i++) {
    const tx = await sdk.getTransaction(txid);
    if (tx.isChainLocked) return;
    if (intent.instant_send !== 0 && tx.isInstantLocked) return;
    if (tx.confirmations >= minConf) return;
    await sleep(15_000);
  }
}

// Single settlement path: verify finality + amount, notify the backend, sweep.
// Safe to call from both detection paths and more than once (idempotent).
async function settleIntent(intentId: string, txid: string): Promise<void> {
  if (settling.has(intentId)) return;
  settling.add(intentId);
  try {
    let intent = getIntent(intentId);
    if (intent === undefined || TERMINAL.has(intent.status)) return;

    await awaitFinality(getSdk(), txid, intent);

    intent = getIntent(intentId);
    if (intent === undefined || TERMINAL.has(intent.status)) return;

    const received = await receivedDuffs(txid, intent.address);
    const event = received < intent.expected_duffs ? "mismatch" : "confirmed";
    updateIntent(intentId, { status: event, txid, received_duffs: received });
    await sendCallback(event, { ...intent, status: event, txid, received_duffs: received });

    try {
      const sweepTxid = await sweep({ ...intent, txid, received_duffs: received });
      updateIntent(intentId, { sweep_txid: sweepTxid });
    } catch (err) {
      console.error(`sweep failed for intent ${intentId}:`, err);
    }
  } catch (err) {
    console.error(`settle failed for intent ${intentId}:`, err);
  } finally {
    settling.delete(intentId);
  }
}

async function watchOne(intent: Intent): Promise<void> {
  if (watching.has(intent.id)) return;
  watching.add(intent.id);
  try {
    // Detect ANY incoming payment (>= 1 duff) reaching finality.
    const info = await getSdk().waitForPayment(intent.address, 1);
    await settleIntent(intent.id, info.txid);
  } catch (err) {
    console.error(`watch failed for intent ${intent.id}:`, err);
  } finally {
    watching.delete(intent.id);
  }
}

export function watchIntent(intent: Intent): void {
  void watchOne(intent);
}

// Scan the last N blocks for payments to currently-open intents (recovers
// payments that confirmed while the service was down).
async function reconcile(): Promise<void> {
  const pending = listOpenIntents();
  if (pending.length === 0) return;
  const byAddress = new Map(pending.map((p) => [p.address, p.id]));
  try {
    const sdk = getSdk();
    const tip = (await sdk.getBestBlockHeight()).height;
    const from = Math.max(1, tip - config.reconcileLookbackBlocks + 1);
    for (let h = from; h <= tip; h++) {
      let block: Block;
      try {
        block = Block.fromBytes((await sdk.getBlock({ height: h })).block);
      } catch (err) {
        console.error(`reconcile getBlock ${h} failed:`, err);
        continue;
      }
      for (const tx of block.txs) {
        for (const out of tx.outputs) {
          let addr: string | undefined;
          try {
            addr = out.script.getAddress(NET);
          } catch {
            addr = undefined;
          }
          const id = addr ? byAddress.get(addr) : undefined;
          if (id !== undefined) await settleIntent(id, tx.hash());
        }
      }
    }
  } catch (err) {
    console.error("reconcile failed:", err);
  }
}

export function startWatcher(): void {
  void (async () => {
    // Recover missed payments first, before the expiry timer can close them.
    await reconcile();

    for (const intent of listOpenIntents()) watchIntent(intent);

    setInterval(() => {
      const now = Date.now();
      for (const i of listOpenIntents()) {
        if (new Date(i.expires_at).getTime() <= now) {
          updateIntent(i.id, { status: "expired" });
          void sendCallback("expired", { ...i, status: "expired" });
        }
      }
    }, 30_000);
  })();
}
