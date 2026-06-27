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
import { sweep } from "./sweeper.js";

const watching = new Set<string>();

async function watchOne(intent: Intent): Promise<void> {
  if (watching.has(intent.id)) return;
  watching.add(intent.id);
  try {
    const sdk = getSdk();
    const info = await sdk.waitForPayment(intent.address, intent.expected_duffs);

    const fresh = getIntent(intent.id);
    if (fresh === undefined || fresh.status === "confirmed" || fresh.status === "swept") return;

    updateIntent(intent.id, {
      status: "confirmed",
      txid: info.txid,
      received_duffs: intent.expected_duffs,
    });
    await sendCallback("confirmed", {
      ...fresh,
      status: "confirmed",
      txid: info.txid,
      received_duffs: intent.expected_duffs,
    });

    // Forward funds to the owner address (best-effort; payment already confirmed).
    try {
      const sweepTxid = await sweep({ ...fresh, txid: info.txid });
      updateIntent(intent.id, { status: "swept", sweep_txid: sweepTxid });
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
