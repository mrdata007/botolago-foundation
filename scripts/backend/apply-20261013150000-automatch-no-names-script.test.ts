import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "../..");
const script = readFileSync(
  join(root, "scripts/backend/apply-20261013150000-automatch-no-names.sql"),
  "utf8",
);
const migration = readFileSync(
  join(root, "supabase/migrations/20261013150000_sofascore_automatch_no_names.sql"),
  "utf8",
);
const md5 = (text: string) => createHash("md5").update(text).digest("hex");
/** The text between the first $$ after `signature` and the $$; that closes it (pg_proc.prosrc). */
function bodyOf(source: string, signature: string): string {
  const at = source.indexOf(signature);
  expect(at).toBeGreaterThan(-1);
  const start = source.indexOf("$$", at) + 2;
  return source.slice(start, source.indexOf("$$;", start));
}

describe("production install of the no-names auto-match migration", () => {
  test("pins the exact reviewed migration bytes before executing them", () => {
    expect(script.split("$migration$")[1]).toBe(migration);
    const expected = script.match(/encode\(sha256[\s\S]*?is distinct from '([a-f0-9]{64})'/)?.[1];
    expect(expected).toBe(createHash("sha256").update(migration).digest("hex"));
    expect(script.indexOf("migration differs from reviewed repository bytes")).toBeLessThan(
      script.indexOf("execute source;"),
    );
  });

  test("checks the replaced functions are the reviewed versions, and the new bodies after", () => {
    const previous = readFileSync(
      join(root, "supabase/migrations/20261011130000_sofascore_player_auto_map.sql"),
      "utf8",
    );
    const before = [
      bodyOf(previous, "create function api.service_sofascore_auto_map_players("),
      bodyOf(previous, "create or replace function app_private.football_mapping_supporting_state("),
    ];
    const after = [
      "create or replace function api.service_sofascore_auto_map_players(",
      "create or replace function app_private.football_mapping_supporting_state(",
      "create function app_private.sofascore_position_compatible(",
      "create function app_private.sofascore_automatch_min_matches(",
    ].map((signature) => bodyOf(migration, signature));
    const preflight = script.slice(0, script.indexOf("$preflight$;"));
    const verify = script.slice(script.indexOf("do $verify$"));
    for (const body of before) expect(preflight).toContain(md5(body));
    for (const body of after) expect(verify).toContain(md5(body));
  });

  test("keeps the writer, permission and rehearsal guards", () => {
    expect(script).toContain("production writers are not paused and drained");
    expect(script).toContain(
      "has_table_privilege('service_role','app_private.sofascore_player_sightings'",
    );
    expect(script).toContain("data changed in a way the migration does not do");
    expect(script.trimEnd().endsWith("rollback;")).toBe(true);
    expect(script).not.toContain("commit;");
  });
});

describe("the migration decides without names", () => {
  const body = bodyOf(
    migration,
    "create or replace function api.service_sofascore_auto_map_players(",
  );
  test("the matcher body never compares a name", () => {
    expect(body).not.toContain("person_name_key");
    expect(body).not.toContain("full_name");
    expect(body).not.toContain("display_name");
    expect(body).not.toContain("last_name");
    expect(body).toContain("sofascore_automatch_min_matches()");
  });
});
