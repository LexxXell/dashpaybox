<?php
// Signed-webhook receiver (plain PHP).
//   DASH_CALLBACK_SECRET=... php -S 127.0.0.1:3000 examples/php/webhook.php
// Point CALLBACK_URL at http://<host>:3000/

$secret = getenv('DASH_CALLBACK_SECRET') ?: 'change-me';

$raw = file_get_contents('php://input');                 // RAW body — verify BEFORE parsing
$sig = $_SERVER['HTTP_X_DASH_SIGNATURE'] ?? '';
$expected = hash_hmac('sha256', $raw, $secret);
if (!hash_equals($expected, $sig)) {                     // constant-time compare
    http_response_code(401);
    exit('bad signature');
}

$e = json_decode($raw, true);

// Idempotency by (intent_id, event): replace with durable storage.
$key = $e['intent_id'] . ':' . $e['event'];

switch ($e['event']) {
    case 'confirmed':
        // grant access (received_duffs > expected_duffs => overpayment, still granted)
        break;
    case 'mismatch':
        // underpayment — do NOT grant
        break;
    case 'late':
        // paid after expiry; swept to cold ($e['sweep_txid']) — refund out-of-band
        break;
    case 'expired':
        break;
}

http_response_code(200);                                 // 2xx so the service stops retrying
echo 'ok';
