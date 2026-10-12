import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "../..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const md5 = (text: string) => createHash("md5").update(text).digest("hex");
/** The text between the first $$ after `signature` and the $$; that closes it (pg_proc.prosrc). */
function bodyOf(source: string, signature: string): string {
  const at = source.indexOf(signature);
  expect(at).toBeGreaterThan(-1);
  const start = source.indexOf("$$", at) + 2;
  return source.slice(start, source.indexOf("$$;", start));
}

/** The two install scripts have the same shape; one set of checks covers both. */
function installChecks(args: {
  readonly label: string;
  readonly scriptPath: string;
  readonly migrationPath: string;
  readonly before: ReadonlyArray<readonly [string, string]>; // [source migration, signature]
  readonly after: readonly string[]; // signatures in the new migration
  readonly guards: readonly string[];
}) {
  const script = read(args.scriptPath);
  const migration = read(args.migrationPath);
  describe(`production install of ${args.label}`, () => {
    test("pins the exact reviewed migration bytes before executing them", () => {
      expect(script.split("$migration$")[1]).toBe(migration);
      const expected = script.match(/encode\(sha256[\s\S]*?is distinct from '([a-f0-9]{64})'/)?.[1];
      expect(expected).toBe(createHash("sha256").update(migration).digest("hex"));
      expect(script.indexOf("migration differs from reviewed repository bytes")).toBeLessThan(
        script.indexOf("execute source;"),
      );
    });

    test("checks the replaced functions are the reviewed versions, and the new bodies after", () => {
      const preflight = script.slice(0, script.indexOf("$preflight$;"));
      const verify = script.slice(script.indexOf("do $verify$"));
      for (const [file, signature] of args.before)
        expect(preflight).toContain(md5(bodyOf(read(`supabase/migrations/${file}`), signature)));
      for (const signature of args.after)
        expect(verify).toContain(md5(bodyOf(migration, signature)));
    });

    test("keeps the writer, permission and rehearsal guards", () => {
      expect(script).toContain("production writers are not paused and drained");
      for (const guard of args.guards) expect(script).toContain(guard);
      expect(script.trimEnd().endsWith("rollback;")).toBe(true);
      expect(script).not.toContain("commit;");
    });
  });
}

installChecks({
  label: "the no-names auto-match migration",
  scriptPath: "scripts/backend/apply-20261013150000-automatch-no-names.sql",
  migrationPath: "supabase/migrations/20261013150000_sofascore_automatch_no_names.sql",
  before: [
    [
      "20261011130000_sofascore_player_auto_map.sql",
      "create function api.service_sofascore_auto_map_players(",
    ],
    [
      "20261011130000_sofascore_player_auto_map.sql",
      "create or replace function app_private.football_mapping_supporting_state(",
    ],
  ],
  after: [
    "create or replace function api.service_sofascore_auto_map_players(",
    "create or replace function app_private.football_mapping_supporting_state(",
    "create function app_private.sofascore_position_compatible(",
  ],
  guards: [
    "data changed in a way the migration does not do",
    "app.fantasy_players",
    "a constraint differs from the reviewed migration",
  ],
});

installChecks({
  label: "the 21-day hold migration",
  scriptPath: "scripts/backend/apply-20261013150100-fantasy-hold-21-days.sql",
  migrationPath: "supabase/migrations/20261013150100_sofascore_fantasy_hold_21_days.sql",
  before: [
    [
      "20261011140000_sofascore_fantasy_auto_state.sql",
      "create function api.service_sofascore_fantasy_due(",
    ],
    [
      "20261011140000_sofascore_fantasy_auto_state.sql",
      "create function api.service_sofascore_fantasy_note(",
    ],
  ],
  after: [
    "create or replace function api.service_sofascore_fantasy_due(",
    "create or replace function api.service_sofascore_fantasy_note(",
    "create function app_private.sofascore_fantasy_hold_window(",
  ],
  guards: ["the attempts changed in a way the migration does not do"],
});

describe("the matcher decides without names", () => {
  const migration = read("supabase/migrations/20261013150000_sofascore_automatch_no_names.sql");
  const body = bodyOf(
    migration,
    "create or replace function api.service_sofascore_auto_map_players(",
  );
  test("the matcher body never compares a name", () => {
    expect(body).not.toContain("person_name_key");
    // No name of an existing player is read; the only names written are the new player's own.
    expect(body).not.toMatch(/\b(pl|p|mem)\.(full_name|display_name|first_name|last_name)\b/);
    expect(body).not.toMatch(/\b(lower|similarity|levenshtein|ilike)\s*\(/i);
  });
  test("a created player takes the existing price path and the catalog locks, and never pauses crons", () => {
    expect(body).toContain("app_private.fantasy_initial_price_v1(");
    expect(body).toContain("'fantasy:catalog:'");
    expect(body).toContain("'fantasy:squads:'");
    expect(body).not.toContain("hold_scheduled_jobs");
    expect(body).not.toContain("lock table");
  });
});
