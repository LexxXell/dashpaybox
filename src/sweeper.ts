// Sweep settled funds from a one-time address to OWNER_STORAGE_ADDRESS.
//
// TODO(Phase 2): decrypt intent.enc_privkey, build a Transaction spending the
// address UTXOs to config.ownerStorageAddress (minus fee), sign with the
// one-time key, broadcast via dash-core-p2p, then updateIntent(sweep_txid).
import type { Intent } from "./db.js";

export async function sweep(intent: Intent): Promise<string> {
  void intent;
  throw new Error("sweep not implemented (Phase 2: dash-core-p2p broadcast)");
}
