import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "../..");
const script = readFileSync(
  join(root, "scripts/backend/apply-20261013180000-fast-fantasy-points-save.sql"),
  "utf8",
);
const migration = readFileSync(
  join(root, "supabase/migrations/20261013180000_fast_fantasy_points_save.sql"),
  "utf8",
);
const previous = readFileSync(
  join(root, "supabase/migrations/20260927140000_incremental_fantasy_points.sql"),
  "utf8",
);
const md5 = (text: string) => createHash("md5").update(text).digest("hex");
const signature = "create or replace function api.service_persist_fantasy_scoring_results(";
/** The text between the first $$ after `signature` and the $$; that closes it (pg_proc.prosrc). */
function bodyOf(source: string): string {
  const at = source.indexOf(signature);
  expect(at).toBeGreaterThan(-1);
  const start = source.indexOf("$$", at) + 2;
  return source.slice(start, source.indexOf("$$;", start));
}

describe("production install of the faster points save", () => {
  test("pins the exact reviewed migration bytes before executing them", () => {
    expect(script.split("$migration$")[1]).toBe(migration);
    const expected = script.match(/encode\(sha256[\s\S]*?is distinct from '([a-f0-9]{64})'/)?.[1];
    expect(expected).toBe(createHash("sha256").update(migration).digest("hex"));
    expect(script.indexOf("migration differs from reviewed repository bytes")).toBeLessThan(
      script.indexOf("execute source;"),
    );
  });

  test("checks the replaced body is the reviewed one, and the new body after", () => {
    const preflight = script.slice(0, script.indexOf("$preflight$;"));
    const verify = script.slice(script.indexOf("do $verify$"));
    const oldBody = bodyOf(previous);
    const newBody = bodyOf(migration);
    expect(oldBody).not.toBe(newBody);
    expect(preflight).toContain(md5(oldBody));
    expect(verify).toContain(md5(newBody));
    // The migration refuses to replace anything but the same previous body, by itself.
    expect(migration).toContain(md5(oldBody));
    expect(migration.indexOf("fast_points_save_unexpected_previous_body")).toBeLessThan(
      migration.indexOf(signature),
    );
  });

  test("keeps the signature, the security settings and the grants of the previous version", () => {
    const header = (source: string) =>
      source.slice(source.indexOf(signature), source.indexOf("$$", source.indexOf(signature)) + 2);
    expect(header(migration)).toBe(header(previous));
    const tail = (source: string) =>
      source.slice(
        source.indexOf("revoke all on function api.service_persist_fantasy_scoring_results"),
      );
    expect(tail(migration).trim()).toBe(
      `revoke all on function api.service_persist_fantasy_scoring_results(uuid,bigint,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function api.service_persist_fantasy_scoring_results(uuid,bigint,text,jsonb,jsonb) to service_role;`,
    );
    expect(script).toContain("has_function_privilege('anon'");
    expect(script).toContain("not has_function_privilege('service_role'");
  });

  test("keeps the writer, rehearsal and no-data-change guards", () => {
    expect(script).toContain("production writers are not paused and drained");
    expect(script).toContain("data changed in a way the migration does not do");
    expect(script.trimEnd().endsWith("rollback;")).toBe(true);
    expect(script).not.toContain("commit;");
  });

  test("the migration keeps the error codes and messages of the previous version", () => {
    const codes = (source: string) =>
      new Set(
        [...bodyOf(source).matchAll(/errcode='(PT\d+)',\s*message='([a-z_]+)'/g)].map(
          (match) => `${match[1]}:${match[2]}`,
        ),
      );
    const before = codes(previous);
    const after = codes(migration);
    expect(before.size).toBeGreaterThan(15);
    for (const code of before) expect(after.has(code)).toBe(true);
    for (const code of after) expect(before.has(code)).toBe(true);
  });
});
