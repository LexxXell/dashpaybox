<?php
// Create a payment intent (plain PHP + curl).
//   DASH_AUTH_SECRET=... php examples/php/create-intent.php

$service = getenv('DASH_SERVICE_URL') ?: 'http://localhost:8090';
$auth = getenv('DASH_AUTH_SECRET') ?: 'change-me';

$payload = json_encode(['order_id' => 'order-123', 'amount_minor' => 1000, 'currency' => 'USD']);

$ch = curl_init("$service/intents");
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => $payload,
    CURLOPT_HTTPHEADER => ['Content-Type: application/json', "X-Dash-Auth: $auth"],
    CURLOPT_RETURNTRANSFER => true,
]);
$res = curl_exec($ch);
$code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($code !== 200) {
    fwrite(STDERR, "intent failed: HTTP $code\n");
    exit(1);
}

$intent = json_decode($res, true);
echo "Pay to: {$intent['address']}\n";
echo "URI (QR): {$intent['uri']}\n";
// Persist $intent['intent_id'] against your order; the webhook will reference it.
