import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Shared checks for the guarded apply scripts of the Phase A/B migrations
 * (scripts/backend/apply-20261014180100-*, apply-20261015120200-*,
 * apply-20261015120300-*). Each script records its migration file whole in
 * supabase_migrations.schema_migrations and runs it from that record only
 * once its sha256 matches the repository file, so the file must be carried
 * byte for byte, once, and the hash the script checks must be the file's.
 * Each script ships as a rehearsal (ends in rollback) and its preflight and
 * postflight must not write.
 */

export const root = join(import.meta.dir, "../..");
export const read = (path: string) => readFileSync(join(root, path), "utf8");
export const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
export const md5 = (text: string) => createHash("md5").update(text, "utf8").digest("hex");
export const occurrences = (haystack: string, needle: string) => haystack.split(needle).length - 1;

/** Comments and string literals blanked, so only statements are matched. */
export function statementsOf(sql: string): string {
  // A small scanner rather than two regular expressions: a string may hold
  // "--" and a comment may hold an apostrophe. Dollar-quoted bodies are SQL
  // and are scanned like the rest.
  let out = "";
  let i = 0;
  while (i < sql.length) {
    if (sql.startsWith("--", i)) {
      const end = sql.indexOf("\n", i);
      i = end === -1 ? sql.length : end;
    } else if (sql[i] === "'") {
      i += 1;
      while (i < sql.length) {
        if (sql[i] === "'" && sql[i + 1] === "'") i += 2;
        else if (sql[i] === "'") break;
        else i += 1;
      }
      i += 1;
      out += "''";
    } else {
      out += sql[i];
      i += 1;
    }
  }
  return out;
}

/**
 * What PostgreSQL stores as pg_proc.prosrc for the function whose
 * `create [or replace] function <signature>` starts at `signaturePattern`:
 * the text between the first `$$` after it and the `$$` that closes it.
 */
export function bodyOf(source: string, signaturePattern: RegExp): string {
  const match = signaturePattern.exec(source);
  expect(match).not.toBeNull();
  const start = source.indexOf("$$", match!.index + match![0].length) + 2;
  expect(start).toBeGreaterThan(1);
  return source.slice(start, source.indexOf("$$", start));
}

export const migrationFiles = () =>
  readdirSync(join(root, "supabase/migrations"))
    .filter((file) => file.endsWith(".sql"))
    .sort();

/** The last migration before `version` whose statements match `definition`. */
export function lastDefinerBefore(version: string, definition: RegExp): string | undefined {
  let found: string | undefined;
  for (const file of migrationFiles()) {
    const fileVersion = file.split("_")[0]!;
    if (fileVersion >= version) break;
    if (definition.test(statementsOf(read(`supabase/migrations/${file}`)))) found = fileVersion;
  }
  return found;
}

/** The part of the script between two markers (end marker exclusive). */
export function between(script: string, start: string, end: string): string {
  const from = script.indexOf(start);
  expect(from).toBeGreaterThan(-1);
  const to = script.indexOf(end, from + start.length);
  expect(to).toBeGreaterThan(from);
  return script.slice(from, to);
}

export type ApplySpec = {
  version: string;
  name: string;
  /** Path of the apply script, relative to the repository root. */
  scriptPath: string;
  /** Strings that must appear in the script before its first write (the history insert). */
  guards: string[];
  /** The owner runbook the header points to (default: the Phase A/B runbook). */
  runbook?: string;
};

export function commonApplyScriptTests(spec: ApplySpec) {
  const { version, name } = spec;
  const script = read(spec.scriptPath);
  const migration = read(`supabase/migrations/${version}_${name}.sql`);
  const tag = `$bg_${version}_file$`;
  const outsideMigration = script.replace(migration, "");

  test("carries the migration byte for byte and checks it before running it", () => {
    expect(migration).not.toContain(tag);
    expect(occurrences(script, migration)).toBe(1);
    expect(script).toContain(`array[${tag}${migration}${tag}]`);
    expect(script).toContain(`  '${version}',\n  '${name}',\n  array[${tag}`);
    expect(script).toContain(
      `if encode(sha256(convert_to(part_${version}, 'UTF8')), 'hex')\n    is distinct from '${sha256(migration)}' then`,
    );
    expect(occurrences(script, `execute part_${version};`)).toBe(1);
    expect(occurrences(script, "insert into supabase_migrations.schema_migrations")).toBe(1);
    // Recorded the way the promoter and the other apply scripts record a file:
    // one statement, the whole file.
    expect(script).toContain(
      `select statements[1] from supabase_migrations.schema_migrations where version = '${version}'`,
    );
  });

  test("names the target project and the order it runs in", () => {
    const header = script.slice(0, script.indexOf("\nbegin;\n"));
    expect(header).toContain("BotolaGO Production V2 (tkewgajrljbwgwedqsxn)");
    for (const heading of ["WHEN", "WHAT TO PAUSE", "HOW TO RUN", "WHAT IT DOES"]) {
      expect(header).toContain(`-- ${heading}`);
    }
    expect(header).toContain("Nothing needs pausing");
    expect(header).toContain("REHEARSAL");
    expect(header).toContain("Change the line `rollback;`");
    expect(header).toContain(
      spec.runbook ?? "docs/production/PHASE_A_B_MIGRATIONS_OWNER_RUNBOOK.md",
    );
    // Never aimed at the staging or legacy projects.
    expect(script).not.toContain("srdrflfrfpwixsllveid");
    expect(script).not.toContain("kxpaudvntwxpahyjtxbk");
  });

  test("ships as a rehearsal: one begin, one rollback, no commit", () => {
    const lines = script.split("\n").map((line) => line.trim());
    expect(lines.filter((line) => line === "begin;")).toHaveLength(1);
    expect(lines.filter((line) => line === "rollback;")).toHaveLength(1);
    expect(lines.filter((line) => line === "commit;")).toHaveLength(0);
    // The rollback comes after the postflight, and the result row after it.
    expect(script.indexOf("$postflight$;")).toBeLessThan(script.indexOf("\nrollback;\n"));
    expect(script.indexOf("\nrollback;\n")).toBeLessThan(script.indexOf("as result;"));
    expect(script).toContain("'Rehearsal passed.");
    expect(script).toContain("then 'Applied.");
    // The result row tells the two apart by the history row, which a rollback removes.
    expect(script).toContain(
      `exists (select 1 from supabase_migrations.schema_migrations where version = '${version}')`,
    );
  });

  test("bounds its locks and checks production is as reviewed before writing anything", () => {
    const firstWrite = script.indexOf("insert into supabase_migrations.schema_migrations");
    expect(firstWrite).toBeGreaterThan(0);
    for (const guard of [
      "set local lock_timeout = '5s';",
      "set local statement_timeout = '60s';",
      "supabase_migrations.schema_migrations does not exist -- is this the BotolaGO database?",
      `migration ${version} is already recorded as applied`,
      ...spec.guards,
    ]) {
      const at = script.indexOf(guard);
      expect({ guard, found: at !== -1 }).toEqual({ guard, found: true });
      expect({ guard, beforeFirstWrite: at < firstWrite }).toEqual({
        guard,
        beforeFirstWrite: true,
      });
    }
  });

  test("the checks around the migration only read", () => {
    // Everything outside the embedded migration, comments and literals blanked:
    // the only writes are the history insert and the migration run from it.
    const statements = statementsOf(outsideMigration);
    const writes = [
      ...statements.matchAll(
        /\b(insert\s+into|update|delete\s+from|truncate|create|alter|drop|grant|revoke|comment\s+on)\b[^;]*/gi,
      ),
    ].map((match) => match[0].replace(/\s+/g, " ").trim());
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatch(/^insert into supabase_migrations\.schema_migrations\b/i);
    // The only thing a check sets is its own transaction-local baseline
    // (is_local = true), never a session setting that outlives the rollback.
    expect(statements).not.toMatch(/set_config\([^;]*?,\s*false\)/i);
    // It never sends an alert, calls the public endpoint or writes a setting.
    expect(statements).not.toMatch(
      /\bops_alert_tick\s*\(|\bops_alert_configure\s*\(|\bcron\.(schedule|unschedule|alter_job)\b|\bnet\.http/i,
    );
  });

  test("the migration is the newest file for its version and its name matches", () => {
    const files = migrationFiles().filter((file) => file.startsWith(`${version}_`));
    expect(files).toEqual([`${version}_${name}.sql`]);
  });
}
