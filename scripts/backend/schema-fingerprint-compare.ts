/**
 * Compare two schema fingerprints (scripts/backend/sql/schema-fingerprint.sql
 * run with `psql -At -F $'\t'`), typically production against a local
 * `supabase db reset` at the same migration. Prints every object that exists
 * on one side only or whose definition differs, and exits 1 when there is
 * any. Read-only: it only reads the two files.
 *
 * Usage: bun scripts/backend/schema-fingerprint-compare.ts <expected.tsv> <actual.tsv>
 */
import { readFileSync } from "node:fs";

export type Fingerprint = ReadonlyMap<string, string>;

export interface FingerprintDiff {
  readonly missing: string[];
  readonly unexpected: string[];
  readonly different: string[];
}

export function parseFingerprint(text: string): Fingerprint {
  const rows = new Map<string, string>();
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const [kind, identity, md5, ...rest] = line.split("\t");
    if (!kind || !identity || !md5 || rest.length > 0 || !/^[0-9a-f]{32}$/.test(md5)) {
      throw new Error(`not a fingerprint row: ${JSON.stringify(line.slice(0, 120))}`);
    }
    rows.set(`${kind} ${identity}`, md5);
  }
  return rows;
}

export function compareFingerprints(expected: Fingerprint, actual: Fingerprint): FingerprintDiff {
  const missing: string[] = [];
  const different: string[] = [];
  for (const [key, md5] of expected) {
    const other = actual.get(key);
    if (other === undefined) missing.push(key);
    else if (other !== md5) different.push(key);
  }
  const unexpected = [...actual.keys()].filter((key) => !expected.has(key));
  return { missing: missing.sort(), unexpected: unexpected.sort(), different: different.sort() };
}

if (import.meta.main) {
  const [expectedPath, actualPath] = process.argv.slice(2);
  if (!expectedPath || !actualPath) {
    console.error(
      "usage: bun scripts/backend/schema-fingerprint-compare.ts <expected.tsv> <actual.tsv>",
    );
    process.exit(2);
  }
  const expected = parseFingerprint(readFileSync(expectedPath, "utf8"));
  const actual = parseFingerprint(readFileSync(actualPath, "utf8"));
  const diff = compareFingerprints(expected, actual);
  console.log(`${expected.size} objects expected, ${actual.size} found`);
  for (const [label, keys] of [
    ["missing (expected, not found)", diff.missing],
    ["unexpected (found, not expected)", diff.unexpected],
    ["different definition", diff.different],
  ] as const) {
    console.log(`${label}: ${keys.length}`);
    for (const key of keys) console.log(`  ${key}`);
  }
  process.exit(diff.missing.length + diff.unexpected.length + diff.different.length > 0 ? 1 : 0);
}
