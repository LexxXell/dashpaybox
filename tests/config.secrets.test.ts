import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { secret, resolveKeysEncryptionSecret } from "../src/config.js";

function tmp(): string {
  return mkdtempSync(join(tmpdir(), "dashpaybox-secrets-"));
}

test("secret() reads from env", () => {
  process.env.TEST_SECRET_A = "from-env";
  try {
    assert.equal(secret("TEST_SECRET_A"), "from-env");
  } finally {
    delete process.env.TEST_SECRET_A;
  }
});

test("secret() reads from <NAME>_FILE when env is absent", () => {
  const dir = tmp();
  const file = join(dir, "s.txt");
  writeFileSync(file, "  from-file\n"); // trimmed
  process.env.TEST_SECRET_B_FILE = file;
  try {
    assert.equal(secret("TEST_SECRET_B"), "from-file");
  } finally {
    delete process.env.TEST_SECRET_B_FILE;
  }
});

test("secret() throws when neither env nor file present", () => {
  assert.throws(() => secret("TEST_SECRET_MISSING"), /Missing required env/);
});

test("resolveKeysEncryptionSecret auto-generates on a clean install and reuses it", () => {
  const saved = process.env.KEYS_ENCRYPTION_SECRET;
  delete process.env.KEYS_ENCRYPTION_SECRET;
  try {
    const dir = tmp();
    const dbPath = join(dir, "dash.db"); // does not exist yet
    const keyPath = join(dir, "keys_encryption_secret");

    const k1 = resolveKeysEncryptionSecret(dbPath);
    assert.match(k1, /^[0-9a-f]{64}$/, "32-byte hex key");
    assert.ok(existsSync(keyPath));
    assert.equal(statSync(keyPath).mode & 0o777, 0o600, "key file is 0600");
    assert.equal(readFileSync(keyPath, "utf8"), k1);

    const k2 = resolveKeysEncryptionSecret(dbPath); // restart
    assert.equal(k2, k1, "reuses the persisted key");
  } finally {
    if (saved !== undefined) process.env.KEYS_ENCRYPTION_SECRET = saved;
  }
});

test("resolveKeysEncryptionSecret refuses to generate when a DB already exists", () => {
  const saved = process.env.KEYS_ENCRYPTION_SECRET;
  delete process.env.KEYS_ENCRYPTION_SECRET;
  try {
    const dir = tmp();
    const dbPath = join(dir, "dash.db");
    writeFileSync(dbPath, ""); // DB exists, key file does not
    assert.throws(() => resolveKeysEncryptionSecret(dbPath), /refusing to/);
  } finally {
    if (saved !== undefined) process.env.KEYS_ENCRYPTION_SECRET = saved;
  }
});
