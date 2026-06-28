"""Create a payment intent (stdlib only).

    DASH_AUTH_SECRET=... python examples/python/create_intent.py
"""
import json
import os
import urllib.request

SERVICE = os.environ.get("DASH_SERVICE_URL", "http://localhost:8090")
AUTH = os.environ.get("DASH_AUTH_SECRET", "change-me")

body = json.dumps({"order_id": "order-123", "amount_minor": 1000, "currency": "USD"}).encode()
req = urllib.request.Request(
    f"{SERVICE}/intents",
    data=body,
    headers={"Content-Type": "application/json", "X-Dash-Auth": AUTH},
    method="POST",
)

with urllib.request.urlopen(req) as resp:
    intent = json.load(resp)

print("Pay to:", intent["address"])
print("URI (QR):", intent["uri"])
# Persist intent["intent_id"] against your order; the webhook will reference it.
