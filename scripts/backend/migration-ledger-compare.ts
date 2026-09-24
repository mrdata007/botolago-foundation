/**
 * Compare a database's migration history (scripts/backend/sql/migration-ledger.sql
 * run with `psql -At -F $'\t'`) with the repository's migration files and the
 * known renumberings in production-migration-aliases.json. Read-only.
 *
 * Every recorded migration must be a repository file, at its own version or
 * at its alias, with the same code: comments, blank lines, indentation and
 * the apply wrappers' timeouts set aside (`code`), or, for a file the
 * Supabase CLI stored split into statements, also whitespace and semicolons
 * (`dense`). Repository files the database has not recorded are pending.
 * Exits 1 on anything else: a version recorded for code the repository does
 * not have, or code that differs.
 *
 * Usage: bun scripts/backend/migration-ledger-compare.ts <ledger.tsv>
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "../..");

export interface Fingerprints {
  /** Code lines, trimmed, joined by newlines. */
  readonly code: string;
  /** The same without any whitespace or semicolons. */
  readonly dense: string;
}

export interface LedgerRow extends Fingerprints {
  readonly version: string;
  readonly name: string;
}

export interface RepositoryMigration extends Fingerprints {
  readonly version: string;
  readonly name: string;
}

export interface Alias {
  readonly repository: string;
  readonly production: string;
}

export interface LedgerReport {
  /** Same version, same code. */
  readonly matched: string[];
  /** Same version, same code once statement splitting is set aside. */
  readonly split: string[];
  /** Recorded under a known alias, same code. */
  readonly aliased: string[];
  readonly pending: string[];
  readonly unknown: string[];
  readonly different: string[];
}

const WRAPPER = /^set local (lock_timeout|statement_timeout) = '[^']*';?$/i;
const md5 = (text: string) => createHash("md5").update(text).digest("hex");

/** The same normalisation as migration-ledger.sql. */
export function fingerprints(sql: string): Fingerprints {
  const text = sql
    .split("\n")
    .map((line) => line.replace(/^[ \t\r]+|[ \t\r]+$/g, ""))
    .filter((line) => line !== "" && !line.startsWith("--") && !WRAPPER.test(line))
    .join("\n");
  return { code: md5(text), dense: md5(text.replace(/[ \t\r\n;]/g, "")) };
}

export function parseLedger(text: string): LedgerRow[] {
  return text
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => {
      const [version, name, code, dense, ...rest] = line.split("\t");
      const hex = /^[0-9a-f]{32}$/;
      if (
        !version ||
        !/^\d{14}$/.test(version) ||
        !name ||
        !code ||
        !hex.test(code) ||
        !dense ||
        !hex.test(dense) ||
        rest.length > 0
      ) {
        throw new Error(`not a ledger row: ${JSON.stringify(line.slice(0, 120))}`);
      }
      return { version, name, code, dense };
    });
}

export function readRepositoryMigrations(
  dir = join(ROOT, "supabase/migrations"),
): RepositoryMigration[] {
  return readdirSync(dir)
    .filter((file) => /^\d{14}_[a-z0-9_]+\.sql$/.test(file))
    .sort()
    .map((file) => ({
      version: file.slice(0, 14),
      name: file.slice(15, -4),
      ...fingerprints(readFileSync(join(dir, file), "utf8")),
    }));
}

export function readAliases(
  path = join(import.meta.dir, "production-migration-aliases.json"),
): Alias[] {
  return (JSON.parse(readFileSync(path, "utf8")) as { aliases: Alias[] }).aliases;
}

export function compareLedger(
  ledger: readonly LedgerRow[],
  repository: readonly RepositoryMigration[],
  aliases: readonly Alias[],
): LedgerReport {
  const byVersion = new Map(repository.map((m) => [m.version, m]));
  const aliasByRecorded = new Map(aliases.map((a) => [a.production, a.repository.slice(0, 14)]));
  const recorded = new Set<string>();
  const report: LedgerReport = {
    matched: [],
    split: [],
    aliased: [],
    pending: [],
    unknown: [],
    different: [],
  };

  for (const row of ledger) {
    const aliasOf = aliasByRecorded.get(row.version);
    const file = byVersion.get(aliasOf ?? row.version);
    const label = `${row.version}_${row.name}`;
    if (!file || file.name !== row.name) {
      report.unknown.push(label);
      continue;
    }
    recorded.add(file.version);
    if (file.code !== row.code && file.dense !== row.dense) report.different.push(label);
    else if (aliasOf) report.aliased.push(`${label} = ${file.version}_${file.name}`);
    else if (file.code === row.code) report.matched.push(label);
    else report.split.push(label);
  }
  for (const m of repository) {
    if (!recorded.has(m.version)) report.pending.push(`${m.version}_${m.name}`);
  }
  return report;
}

if (import.meta.main) {
  const [ledgerPath] = process.argv.slice(2);
  if (!ledgerPath) {
    console.error("usage: bun scripts/backend/migration-ledger-compare.ts <ledger.tsv>");
    process.exit(2);
  }
  const report = compareLedger(
    parseLedger(readFileSync(ledgerPath, "utf8")),
    readRepositoryMigrations(),
    readAliases(),
  );
  for (const [label, rows] of Object.entries(report)) {
    console.log(`${label}: ${rows.length}`);
    if (label !== "matched") for (const row of rows) console.log(`  ${row}`);
  }
  process.exit(report.unknown.length + report.different.length > 0 ? 1 : 0);
}
