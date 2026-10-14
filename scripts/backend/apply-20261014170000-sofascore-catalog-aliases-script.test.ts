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

const MIGRATION = "supabase/migrations/20261014170000_sofascore_catalog_aliases.sql";
const migration = read(MIGRATION);
const script = read("scripts/backend/apply-20261014170000-sofascore-catalog-aliases.sql");
const aliases = read("scripts/backend/attach-sofascore-verified-aliases.sql");

describe("production install of the catalog aliases migration", () => {
  test("pins the exact reviewed migration bytes before executing them", () => {
    expect(script.split("$migration$")[1]).toBe(migration);
    const expected = script.match(/encode\(sha256[\s\S]*?is distinct from '([a-f0-9]{64})'/)?.[1];
    expect(expected).toBe(createHash("sha256").update(migration).digest("hex"));
    expect(script.indexOf("migration differs from reviewed repository bytes")).toBeLessThan(
      script.indexOf("execute source;"),
    );
  });

  test("checks the six replaced functions are the reviewed versions, and every new body after", () => {
    const preflight = script.slice(0, script.indexOf("$preflight$;"));
    const verify = script.slice(script.indexOf("do $verify$"));
    const before: Array<[string, string]> = [
      [
        "20261013150000_sofascore_automatch_no_names.sql",
        "create or replace function api.service_sofascore_auto_map_players(",
      ],
      [
        "20261011191737_sofascore_fantasy_context_review_proofs.sql",
        "create or replace function api.service_sofascore_fantasy_context(",
      ],
      [
        "20261012120000_sofascore_hands_off.sql",
        "create or replace function api.service_record_sofascore_fantasy_observation(",
      ],
      [
        "20261011180000_sofascore_player_performances.sql",
        "create function app_private.sofascore_sync_fixture_performances(",
      ],
      [
        "20261011130000_sofascore_player_auto_map.sql",
        "create function api.admin_sofascore_player_match_queue(",
      ],
      [
        "20261012120000_sofascore_hands_off.sql",
        "create or replace function api.admin_resolve_sofascore_player_match(",
      ],
    ];
    for (const [file, signature] of before)
      expect(preflight).toContain(md5(bodyOf(read(`supabase/migrations/${file}`), signature)));
    const after = [
      "create or replace function api.service_sofascore_auto_map_players(",
      "create or replace function api.service_sofascore_fantasy_context(",
      "create or replace function api.service_record_sofascore_fantasy_observation(",
      "create or replace function app_private.sofascore_sync_fixture_performances(",
      "create or replace function api.admin_sofascore_player_match_queue(",
      "create or replace function api.admin_resolve_sofascore_player_match(",
      "create function app_private.sofascore_player_identity(",
      "create function app_private.sofascore_create_catalog_player(",
      "create function app_private.sofascore_link_alias(",
      "create function api.admin_sofascore_player_link_options(",
      "create function api.admin_sofascore_link_alias(",
      "create function api.admin_sofascore_create_player(",
    ];
    for (const signature of after) expect(verify).toContain(md5(bodyOf(migration, signature)));
  });

  test("keeps the writer, data and rehearsal guards", () => {
    expect(script).toContain("production writers are not paused and drained");
    expect(script).toContain("data changed in a way the migration does not do");
    expect(script).toContain("a constraint or trigger differs from the reviewed migration");
    expect(script).toContain("sofascore-rating-release-pause.sql");
    expect(script).toContain("sofascore-rating-release-resume.sql");
    expect(script.trimEnd().endsWith("rollback;")).toBe(true);
    expect(script).not.toContain("commit;");
  });
});

describe("the migration", () => {
  test("keeps the main link one row per player: the mapping table's unique constraints are untouched", () => {
    expect(migration).not.toMatch(/drop constraint football_provider_mappings_/);
    expect(migration).not.toMatch(/alter table app_private\.football_provider_mappings\b/);
  });

  test("every replaced reader resolves an id through the identity, not the mapping table alone", () => {
    for (const signature of [
      "create or replace function api.service_record_sofascore_fantasy_observation(",
      "create or replace function app_private.sofascore_sync_fixture_performances(",
      "create or replace function api.service_sofascore_fantasy_context(",
    ]) {
      const body = bodyOf(migration, signature);
      expect(body).toContain("app_private.sofascore_player_identity(");
      expect(body).not.toContain("select m.id into v_mapping");
    }
    const matcher = bodyOf(
      migration,
      "create or replace function api.service_sofascore_auto_map_players(",
    );
    expect(matcher).toContain("app_private.sofascore_player_aliases");
    expect(matcher).toContain("app_private.sofascore_create_catalog_player(");
    // The creation moved out whole: no player, membership or pool insert is left in the matcher.
    expect(matcher).not.toContain("insert into app.players");
    expect(matcher).not.toContain("insert into app.fantasy_players");
  });

  test("the shared creation keeps the matcher's price path and locks, and never pauses crons", () => {
    const create = bodyOf(
      migration,
      "create function app_private.sofascore_create_catalog_player(",
    );
    expect(create).toContain("app_private.fantasy_initial_price_v1(v_pos_code, 6.0, 0.0)");
    expect(create).toContain("'fantasy:catalog:'");
    expect(create).toContain("'fantasy:squads:'");
    expect(create).toContain("'sofascore_player_created_v1'");
    expect(create).not.toContain("hold_scheduled_jobs");
    expect(create).not.toContain("lock table");
  });

  test("every staff action checks the permission, logs the staff user and reopens held matches", () => {
    for (const signature of [
      "create function api.admin_sofascore_link_alias(",
      "create function api.admin_sofascore_create_player(",
    ]) {
      const body = bodyOf(migration, signature);
      expect(body).toContain("app_private.admin_assert_permission('football.manage_mappings')");
    }
    const link = bodyOf(migration, "create function app_private.sofascore_link_alias(");
    expect(link).toContain("'staff-alias'");
    expect(link).toContain("p_decided_by");
    expect(link).toContain("app_private.sofascore_fantasy_reopen(");
    const create = bodyOf(migration, "create function api.admin_sofascore_create_player(");
    expect(create).toContain("'staff-resolution'");
    expect(create).toContain("app_private.sofascore_fantasy_reopen(");
    const options = bodyOf(migration, "create function api.admin_sofascore_player_link_options(");
    expect(options).toContain("app_private.football_mapping_require_reader(");
  });
});

describe("the owner's verified aliases script", () => {
  test("is guarded, rolls back by default, and needs the owner and the paused writers", () => {
    expect(aliases).toContain("c_commit constant boolean := false;");
    expect(aliases).toContain("c_one_writer_checked constant boolean := false;");
    expect(aliases).toContain("'REPLACE-WITH-OWNER-AUTH-USER-ID'");
    expect(aliases).toContain("DRY_RUN_ROLLBACK");
    expect(aliases).toContain("sofascore-rating-release-pause.sql");
    expect(aliases).toContain("GUARD: the writers are not paused and drained");
    expect(aliases).toContain("football.manage_mappings");
    expect(aliases).not.toMatch(/^\s*commit;/m);
  });

  test("attaches exactly the five verified pairs, main <- second", () => {
    const pairs = [...aliases.matchAll(/"main": "(\d+)", "second": "(\d+)"/g)].map(
      (m) => `${m[1]}<-${m[2]}`,
    );
    expect(pairs).toEqual([
      "919620<-2033439",
      "2033440<-2045584",
      "2762914<-2787361",
      "1866448<-2790048",
      // Abu Zrayq, one line per state: moved (intended) and not moved.
      "2837528<-986341",
      "986341<-2837528",
    ]);
    // The uncertain one is never decided here.
    expect(aliases).not.toContain('"2351784"');
  });

  test("handles both Abu Zrayq states explicitly and refuses anything else", () => {
    expect(aliases).toContain("v_abu := 'moved';");
    expect(aliases).toContain("v_abu := 'not moved';");
    expect(aliases).toContain("GUARD: Abu Zrayq is in neither expected state");
    expect(aliases).toContain("already attached (this script has run)");
    expect(aliases).toContain("is not reviewed");
    expect(aliases).toContain("did not read back as an active, reviewed alias");
    expect(aliases).toContain("app_private.sofascore_link_alias(");
  });
});

describe("production install of the match-page alias migration (20261014170100)", () => {
  const MD = "supabase/migrations/20261014170100_sofascore_alias_match_details.sql";
  const md = read(MD);
  const install = read("scripts/backend/apply-20261014170100-sofascore-alias-match-details.sql");
  const previous = read(
    "supabase/migrations/20261014120000_football_match_details_partial_sections.sql",
  );
  const fnOf = (source: string) => {
    const start = source.indexOf("create or replace function api.ingest_football_match_details(");
    return source.slice(start, source.indexOf("\n$$;\n", start));
  };

  test("pins the exact reviewed migration bytes before executing them", () => {
    expect(install.split("$migration$")[1]).toBe(md);
    const expected = install.match(/encode\(sha256[\s\S]*?is distinct from '([a-f0-9]{64})'/)?.[1];
    expect(expected).toBe(createHash("sha256").update(md).digest("hex"));
    expect(install.indexOf("migration differs from reviewed repository bytes")).toBeLessThan(
      install.indexOf("execute source;"),
    );
  });

  test("requires the 20261014120000 body #473's install pins, and pins the new one", () => {
    const pinned = read("scripts/backend/apply-live-match-details-sections.sql").match(
      /md5\(pg_get_functiondef\(ingest\)\) <> '([0-9a-f]{32})'/,
    )?.[1];
    expect(pinned).toBe("d5ba5e52a6c0129bc21833dcc4945566");
    const preflight = install.slice(0, install.indexOf("$preflight$;"));
    expect(preflight).toContain(`is distinct from '${pinned}'`);
    expect(install.slice(install.indexOf("do $verify$"))).toMatch(
      /is distinct from '[0-9a-f]{32}'/,
    );
    expect(install).toContain("production writers are not paused and drained");
    expect(install).toContain("data changed in a way the migration does not do");
    expect(install.trimEnd().endsWith("rollback;")).toBe(true);
    expect(install).not.toContain("commit;");
  });

  test("the function is #473's version byte for byte except its five player joins", () => {
    const before = fnOf(previous);
    const after = fnOf(md);
    const playerJoin =
      /left join app_private\.football_provider_mappings (player_map|related_map)\n/g;
    expect(before.match(playerJoin)).toHaveLength(5);
    expect(
      before.replace(playerJoin, "left join app_private.football_player_provider_links $1\n"),
    ).toBe(after);
    // Team and fixture joins still read the mapping table.
    expect(after).toContain("join app_private.football_provider_mappings team_map");
  });
});
