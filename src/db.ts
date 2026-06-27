// SQLite persistence for payment intents (the service is self-contained).
import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { config } from "./config.js";

export type IntentStatus = "pending" | "seen" | "confirmed" | "swept" | "expired" | "mismatch";

export interface Intent {
  id: string;
  order_id: string;
  address: string;
  enc_privkey: string;
  expected_duffs: number;
  amount_minor: number;
  currency: string;
  rate: number;
  rate_source: string;
  instant_send: number; // 0/1
  min_confirmations: number;
  status: IntentStatus;
  received_duffs: number | null;
  txid: string | null;
  sweep_txid: string | null;
  created_at: string;
  expires_at: string;
}

mkdirSync(dirname(config.dbPath), { recursive: true });
const db = new Database(config.dbPath);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS intents (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL,
    address TEXT NOT NULL,
    enc_privkey TEXT NOT NULL,
    expected_duffs INTEGER NOT NULL,
    amount_minor INTEGER NOT NULL,
    currency TEXT NOT NULL,
    rate REAL NOT NULL,
    rate_source TEXT NOT NULL,
    instant_send INTEGER NOT NULL DEFAULT 1,
    min_confirmations INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'pending',
    received_duffs INTEGER,
    txid TEXT,
    sweep_txid TEXT,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS ix_intents_status ON intents(status);
  CREATE INDEX IF NOT EXISTS ix_intents_address ON intents(address);
`);

export function insertIntent(i: Intent): void {
  db.prepare(
    `INSERT INTO intents
      (id, order_id, address, enc_privkey, expected_duffs, amount_minor, currency, rate,
       rate_source, instant_send, min_confirmations, status, created_at, expires_at)
     VALUES
      (@id, @order_id, @address, @enc_privkey, @expected_duffs, @amount_minor, @currency, @rate,
       @rate_source, @instant_send, @min_confirmations, @status, @created_at, @expires_at)`,
  ).run(i);
}

export function getIntent(id: string): Intent | undefined {
  return db.prepare("SELECT * FROM intents WHERE id = ?").get(id) as Intent | undefined;
}

export function listOpenIntents(): Intent[] {
  return db
    .prepare("SELECT * FROM intents WHERE status IN ('pending','seen')")
    .all() as Intent[];
}

export function updateIntent(id: string, fields: Partial<Intent>): void {
  const keys = Object.keys(fields);
  if (keys.length === 0) return;
  const set = keys.map((k) => `${k} = @${k}`).join(", ");
  db.prepare(`UPDATE intents SET ${set} WHERE id = @id`).run({ ...fields, id });
}
