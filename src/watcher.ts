// Chain watcher: detect incoming payments and drive intent settlement.
//
// TODO(Phase 2): for each open intent, subscribe to its address via
// dash-core-sdk (DAPI gRPC bloom filter). On an incoming tx:
//   - amount matches expected_duffs → wait for finality (InstantSend when
//     instant_send, else min_confirmations) → sweep() → sendCallback("confirmed")
//   - amount differs → updateIntent(status="mismatch") → sendCallback("mismatch")
// This stub implements only the expiry timer, which is chain-independent.
import { listOpenIntents, updateIntent, type Intent } from "./db.js";
import { sendCallback } from "./callback.js";

export function startWatcher(): void {
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

export function watchIntent(intent: Intent): void {
  // Placeholder: real per-address chain subscription is wired in Phase 2.
  void intent;
}
