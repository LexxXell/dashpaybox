// Test environment defaults. Preloaded (before any src module) via `node --import`
// so config.ts can evaluate without real secrets. Uses `??=` so a test file can
// override a value before dynamically importing the module under test.
import os from "node:os";
import path from "node:path";

process.env.NETWORK ??= "testnet";
process.env.AUTH_SECRET ??= "test-auth-secret";
process.env.CALLBACK_URL ??= "https://example.test/webhook";
process.env.CALLBACK_SECRET ??= "test-callback-secret";
process.env.OWNER_STORAGE_ADDRESS ??= "yTestOwnerStorageAddressPlaceholder";
process.env.KEYS_ENCRYPTION_SECRET ??= "test-keys-encryption-secret-0123456789";
process.env.DB_PATH ??= path.join(os.tmpdir(), `dashpaybox-test-${process.pid}-${Date.now()}.db`);
