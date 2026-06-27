// Chain watcher: detect incoming payments via dash-core-sdk and settle intents.
//
// For each open intent we await `waitForPayment(address, expected_duffs)`, which
// resolves only once a payment of at least the expected amount is InstantLocked
// or ChainLocked (Dash strong finality). We then mark the intent confirmed,
// notify the backend, and sweep funds to the owner address. Unpaid intents are
// closed by the expiry timer.
import { getSdk } from "./dash.js";
import { getIntent, listOpenIntents, updateIntent, type Intent } from "./db.js";
import { sendCallback } from "./callback.js";
import { receivedDuffs, sweep } from "./sweeper.js";

const watching = new Set<string>();
const TERMINAL = new Set(["confirmed", "swept", "mismatch"]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// When InstantSend is disabled, wait for `minConfirmations` block confirmations
// (a ChainLock counts as final regardless). Polls up to ~1h.
async function awaitConfirmations(txid: string, minConfirmations: number): Promise<void> {
  const sdk = getSdk();
  for (let i = 0; i < 240; i++) {
    const tx = await sdk.getTransaction(txid);
    if (tx.isChainLocked || tx.confirmations >= minConfirmations) return;
    await sleep(15_000);
  }
}

async function watchOne(intent: Intent): Promise<void> {
  if (watching.has(intent.id)) return;
  watching.add(intent.id);
  try {
    const sdk = getSdk();
    // Detect ANY incoming payment (>= 1 duff) that reaches finality, then
    // compare the actual amount to what was expected.
    const info = await sdk.waitForPayment(intent.address, 1);
    // InstantSend off → require block confirmations (ChainLock also accepted).
    if (intent.instant_send === 0) {
      await awaitConfirmations(info.txid, intent.min_confirmations);
    }
    const received = await receivedDuffs(info.txid, intent.address);

    const fresh = getIntent(intent.id);
    if (fresh === undefined || TERMINAL.has(fresh.status)) return;

    // Underpayment => mismatch (no access); exact/over => confirmed (access).
    const event = received < fresh.expected_duffs ? "mismatch" : "confirmed";
    updateIntent(intent.id, { status: event, txid: info.txid, received_duffs: received });
    await sendCallback(event, {
      ...fresh,
      status: event,
      txid: info.txid,
      received_duffs: received,
    });

    // Funds arrived in both cases — forward them to the owner address.
    try {
      const sweepTxid = await sweep({ ...fresh, txid: info.txid, received_duffs: received });
      updateIntent(intent.id, { sweep_txid: sweepTxid });
    } catch (err) {
      console.error(`sweep failed for intent ${intent.id}:`, err);
    }
  } catch (err) {
    console.error(`watch failed for intent ${intent.id}:`, err);
  } finally {
    watching.delete(intent.id);
  }
}

export function watchIntent(intent: Intent): void {
  void watchOne(intent);
}

export function startWatcher(): void {
  // Resume watching intents that were open before a restart.
  for (const intent of listOpenIntents()) watchIntent(intent);

  // Expire intents whose payment window elapsed without a confirmed payment.
  setInterval(() => {
    const now = Date.now();
    for (const i of listOpenIntents()) {
      if (new Date(i.expires_at).getTime() <= now) {
        updateIntent(i.id, { status: "expired" });
        void sendCallback("expired", { ...i, status: "expired" });
      }
    }
  }, 30_000);
}
