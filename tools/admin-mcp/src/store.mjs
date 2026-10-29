import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { mkdirSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

export const opaque = () => randomBytes(32).toString("base64url");
export const digest = (value) => createHash("sha256").update(value).digest("hex");
export const now = () => Math.floor(Date.now() / 1000);

// Each row is encrypted, including upstream refresh tokens and client secrets.
// The row key is authenticated too, preventing ciphertext swaps between rows.
export class EncryptedStore {
  constructor(directory, key) {
    if (key.length !== 32) throw new Error("Invalid encryption key.");
    this.key = key;
    process.umask(0o077);
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    chmodSync(directory, 0o700);
    const path = join(directory, "sessions.sqlite");
    this.db = new DatabaseSync(path);
    chmodSync(path, 0o600);
    this.db.exec(
      "PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS records (id TEXT PRIMARY KEY, payload TEXT NOT NULL, expires INTEGER NOT NULL)",
    );
  }
  put(id, value, expires) {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    cipher.setAAD(Buffer.from(`${id}:${expires}`));
    const data = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
    const payload = Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64");
    this.db.prepare("INSERT OR REPLACE INTO records VALUES (?, ?, ?)").run(id, payload, expires);
  }
  get(id) {
    const row = this.db.prepare("SELECT payload, expires FROM records WHERE id = ?").get(id);
    if (!row) return undefined;
    if (row.expires <= now()) {
      this.delete(id);
      return undefined;
    }
    const bytes = Buffer.from(row.payload, "base64");
    const cipher = createDecipheriv("aes-256-gcm", this.key, bytes.subarray(0, 12));
    cipher.setAAD(Buffer.from(`${id}:${row.expires}`));
    cipher.setAuthTag(bytes.subarray(12, 28));
    return JSON.parse(
      Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]).toString(),
    );
  }
  take(id) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const value = this.get(id);
      this.delete(id);
      this.db.exec("COMMIT");
      return value;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  delete(id) {
    this.db.prepare("DELETE FROM records WHERE id = ?").run(id);
  }
  prune() {
    this.db.prepare("DELETE FROM records WHERE expires <= ?").run(now());
  }
  close() {
    this.db.close();
  }
}
