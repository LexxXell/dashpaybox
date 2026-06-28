// Chain watcher: detect incoming payments and settle intents.
//
// Two detection paths feed one settlement routine:
//   - live: `waitForPayment` (mempool + new blocks) while the service runs;
//   - startup reconcile: scan the last N blocks for payments that arrived while
//     the service was down (the live subscription can't replay past blocks).
import { DashCoreSDK } from "dash-core-sdk";
import { config } from "./config.js";
import { getSdk } from "./dash.js";
import {
  getIntent,
  listOpenIntents,
  listSweepableExpired,
  updateIntent,
  type Intent,
} from "./db.js";
import { sendCallback } from "./callback.js";
import { receivedDuffs, scanBlockForAddresses, sweep } from "./sweeper.js";

const watching = new Set<string>();
const settling = new Set<string>();
const TERMINAL = new Set(["confirmed", "swept", "mismatch"]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Defaults give ~60 minutes of polling (240 × 15s); both are parameterized so
// tests can drive the loop quickly.
const FINALITY_ATTEMPTS = 240;
const FINALITY_POLL_MS = 15_000;

// Wait until the payment reaches finality per the intent's policy: InstantSend
// (when enabled) or `min_confirmations` block confirmations; a ChainLock always
// counts as final. Returns true on finality, false if the window elapsed
// WITHOUT it — callers MUST NOT settle on false (the tx may still be reversible
// or never confirm), otherwise the service would grant goods on an unsettled tx.
export async function awaitFinality(
  sdk: DashCoreSDK,
  txid: string,
  intent: Intent,
  attempts: number = FINALITY_ATTEMPTS,
  pollMs: number = FINALITY_POLL_MS,
): Promise<boolean> {
  const minConf = intent.instant_send === 0 ? Math.max(1, intent.min_confirmations) : 1;
  for (let i = 0; i < attempts; i++) {
    const tx = await sdk.getTransaction(txid);
    if (tx.isChainLocked) return true;
    if (intent.instant_send !== 0 && tx.isInstantLocked) return true;
    if (tx.confirmations >= minConf) return true;
    if (i < attempts - 1) await sleep(pollMs);
  }
  return false;
}

// Single settlement path: verify finality + amount, notify the backend, sweep.
// Safe to call from both detection paths and more than once (idempotent).
async function settleIntent(intentId: string, txid: string): Promise<void> {
  if (settling.has(intentId)) return;
  settling.add(intentId);
  try {
    let intent = getIntent(intentId);
    if (intent === undefined || TERMINAL.has(intent.status)) return;

    if (!(await awaitFinality(getSdk(), txid, intent))) {
      console.error(`settle: ${intentId} tx ${txid} not final in time — leaving for retry`);
      return;
    }

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

// A payment that landed after the intent expired: the order is NOT honored (no
// access granted), but the funds must never be stranded on a one-time hot key.
// Consolidate them to the cold owner address and emit a `late` callback so the
// backend can refund the sender out-of-band if it chooses.
async function rescueStranded(intentId: string, txid: string): Promise<void> {
  if (settling.has(intentId)) return;
  settling.add(intentId);
  try {
    let intent = getIntent(intentId);
    if (intent === undefined || intent.status !== "expired" || intent.sweep_txid) return;

    if (!(await awaitFinality(getSdk(), txid, intent))) {
      console.error(`rescue: ${intentId} tx ${txid} not final in time — leaving for retry`);
      return;
    }

    intent = getIntent(intentId);
    if (intent === undefined || intent.status !== "expired" || intent.sweep_txid) return;

    const received = await receivedDuffs(txid, intent.address);
    const sweepTxid = await sweep({ ...intent, txid, received_duffs: received });
    const final = { ...intent, status: "swept" as const, txid, received_duffs: received, sweep_txid: sweepTxid };
    updateIntent(intentId, { status: "swept", txid, received_duffs: received, sweep_txid: sweepTxid });
    await sendCallback("late", final);
  } catch (err) {
    console.error(`rescue failed for intent ${intentId}:`, err);
  } finally {
    settling.delete(intentId);
  }
}

// Route a detected payment: a still-open intent settles normally; one that has
// already expired is rescued (swept to cold, no access granted).
async function onPayment(intentId: string, txid: string): Promise<void> {
  const intent = getIntent(intentId);
  if (intent?.status === "expired") await rescueStranded(intentId, txid);
  else await settleIntent(intentId, txid);
}

async function watchOne(intent: Intent): Promise<void> {
  if (watching.has(intent.id)) return;
  watching.add(intent.id);
  try {
    // Detect ANY incoming payment (>= 1 duff) reaching finality.
    const info = await getSdk().waitForPayment(intent.address, 1);
    await onPayment(intent.id, info.txid);
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
  // Open intents recover normally; expired-but-unswept intents get their late
  // funds consolidated to cold (routed via onPayment by current status).
  const candidates = [...listOpenIntents(), ...listSweepableExpired()];
  if (candidates.length === 0) return;
  const byAddress = new Map(candidates.map((p) => [p.address, p.id]));
  const addresses = new Set(byAddress.keys());
  try {
    const sdk = getSdk();
    const tip = (await sdk.getBestBlockHeight()).height;
    const from = Math.max(1, tip - config.reconcileLookbackBlocks + 1);
    for (let h = from; h <= tip; h++) {
      try {
        const raw = (await sdk.getBlock({ height: h })).block;
        for (const hit of scanBlockForAddresses(raw, addresses)) {
          const id = byAddress.get(hit.address);
          if (id !== undefined) await onPayment(id, hit.txid);
        }
      } catch (err) {
        console.error(`reconcile block ${h} failed:`, err);
      }
    }
  } catch (err) {
    console.error("reconcile failed:", err);
  }
}

let expiryTimer: ReturnType<typeof setInterval> | null = null;

export function startWatcher(): void {
  void (async () => {
    // Recover missed payments first, before the expiry timer can close them.
    await reconcile();

    for (const intent of listOpenIntents()) watchIntent(intent);

    expiryTimer = setInterval(() => {
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

export function stopWatcher(): void {
  if (expiryTimer !== null) {
    clearInterval(expiryTimer);
    expiryTimer = null;
  }
}
