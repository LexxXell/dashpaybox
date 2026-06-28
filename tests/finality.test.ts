import { test } from "node:test";
import assert from "node:assert/strict";
import { awaitFinality } from "../src/watcher.js";
import type { Intent } from "../src/db.js";

type TxState = { isChainLocked: boolean; isInstantLocked: boolean; confirmations: number };

// Fake SDK returning a scripted sequence of getTransaction states (last repeats).
function sdkSeq(states: TxState[]) {
  let i = 0;
  let calls = 0;
  return {
    get calls() {
      return calls;
    },
    sdk: {
      async getTransaction() {
        calls++;
        return states[Math.min(i++, states.length - 1)] as never;
      },
    },
  };
}

function intent(instant_send: number, min_confirmations = 1): Intent {
  return {
    id: "i",
    order_id: "o",
    address: "addr",
    enc_privkey: "enc",
    expected_duffs: 1,
    amount_minor: 1,
    currency: "USD",
    rate: 1,
    rate_source: "test",
    instant_send,
    min_confirmations,
    status: "pending",
    received_duffs: null,
    txid: "tx",
    sweep_txid: null,
    created_at: "",
    expires_at: "",
  };
}

const NF = { isChainLocked: false, isInstantLocked: false, confirmations: 0 };

test("ChainLock counts as final immediately", async () => {
  const f = sdkSeq([{ ...NF, isChainLocked: true }]);
  assert.equal(await awaitFinality(f.sdk as never, "tx", intent(1), 5, 0), true);
  assert.equal(f.calls, 1);
});

test("InstantLock is final when instant_send is enabled", async () => {
  const f = sdkSeq([{ ...NF, isInstantLocked: true }]);
  assert.equal(await awaitFinality(f.sdk as never, "tx", intent(1), 5, 0), true);
  assert.equal(f.calls, 1);
});

test("InstantLock is ignored when instant_send is disabled; waits for confirmations", async () => {
  // 1st poll: instant-locked but only 0 confs (need 2) -> must NOT accept.
  // 2nd poll: 2 confs -> final.
  const f = sdkSeq([
    { isChainLocked: false, isInstantLocked: true, confirmations: 0 },
    { isChainLocked: false, isInstantLocked: true, confirmations: 2 },
  ]);
  assert.equal(await awaitFinality(f.sdk as never, "tx", intent(0, 2), 5, 0), true);
  assert.equal(f.calls, 2, "did not short-circuit on the ignored InstantLock");
});

test("returns false when finality is never reached (C2: timeout is NOT success)", async () => {
  const f = sdkSeq([NF]); // always non-final
  assert.equal(await awaitFinality(f.sdk as never, "tx", intent(1), 3, 0), false);
  assert.equal(f.calls, 3, "polled exactly `attempts` times");
});
