"""Signed-webhook receiver (Flask).

    pip install flask
    DASH_CALLBACK_SECRET=... flask --app examples/python/webhook run --port 3000
"""
import hashlib
import hmac
import os

from flask import Flask, abort, request

CALLBACK_SECRET = os.environ.get("DASH_CALLBACK_SECRET", "change-me").encode()
app = Flask(__name__)
_seen: set[str] = set()  # idempotency by (intent_id, event) — use durable storage


@app.post("/webhooks/dash")
def webhook():
    raw = request.get_data()  # RAW bytes — verify BEFORE parsing
    sig = request.headers.get("X-Dash-Signature", "")
    expected = hmac.new(CALLBACK_SECRET, raw, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, sig):
        abort(401)

    e = request.get_json()
    key = f"{e['intent_id']}:{e['event']}"
    if key in _seen:
        return "ok", 200  # idempotent
    _seen.add(key)

    if e["event"] == "confirmed":
        pass  # grant access (overpayment still grants)
    elif e["event"] == "mismatch":
        pass  # underpayment — do NOT grant
    elif e["event"] == "late":
        pass  # swept to cold (e["sweep_txid"]) — refund out-of-band
    elif e["event"] == "expired":
        pass

    return "ok", 200  # 2xx so the service stops retrying
