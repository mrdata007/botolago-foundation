import { describe, expect, test } from "bun:test";
import {
  between,
  bodyOf,
  commonApplyScriptTests,
  lastDefinerBefore,
  md5,
  read,
  statementsOf,
} from "./apply-script-kit";

/**
 * The guarded script that puts 20261015120300 (old Fantasy rounds name every
 * player they scored, audit FANT-07) on production, after the SofaScore rating
 * release that carries 20261013160200, the wrapper this one wraps again.
 */

const VERSION = "20261015120300";
const NAME = "fantasy_points_player_identity";
const SCRIPT_PATH = `scripts/backend/apply-${VERSION}-fantasy-points-player-identity.sql`;
const script = read(SCRIPT_PATH);
const migration = read(`supabase/migrations/${VERSION}_${NAME}.sql`);
const preflight = between(script, "do $preflight$", "$preflight$;");
const postflight = between(script, "do $postflight$", "$postflight$;");
const SIGNATURE =
  /create function api\.get_my_fantasy_points\(p_team_id uuid, p_gameweek_id uuid\)/;

describe(`apply-${VERSION}-fantasy-points-player-identity.sql`, () => {
  commonApplyScriptTests({
    version: VERSION,
    name: NAME,
    scriptPath: SCRIPT_PATH,
    guards: [
      "20261013160200 (staged stats progression, the current api.get_my_fantasy_points) is not applied yet",
      "scripts/backend/apply-20261014-sofascore-rating-release.sql (committed) first",
      "api.get_my_fantasy_points_before_identity(uuid,uuid) already exists -- this update was run before",
      "stop: the database is missing roles",
      "the database is missing what the identity read joins",
      "the database is missing functions this update needs",
      "api.get_my_fantasy_points(uuid,uuid) is not the version this update wraps (20261013160200)",
      "api.get_my_fantasy_points(uuid,uuid) has attributes other than the reviewed ones",
      "api.get_my_fantasy_points(uuid,uuid) is not callable by exactly authenticated and service_role",
      "api.get_my_fantasy_points_before_staged(uuid,uuid) is executable by PUBLIC, anon, authenticated or service_role",
      "something depends on api.get_my_fantasy_points by name and would follow the rename",
      "perform set_config('bg.points_privs_before'",
      "perform set_config('bg.cron_jobs_before'",
    ],
  });

  test("the wrapper it wraps is pinned to the repository files, and is the latest definition", () => {
    const current = bodyOf(
      read("supabase/migrations/20261013160200_staged_stats_progression.sql"),
      SIGNATURE,
    );
    const next = bodyOf(migration, SIGNATURE);
    expect(current).not.toBe(next);
    expect(preflight).toContain(`current_points_md5 constant text := '${md5(current)}';`);
    expect(postflight).toContain(`new_points_md5 constant text := '${md5(next)}';`);
    expect(postflight).toContain(`previous_points_md5 constant text := '${md5(current)}';`);
    expect(new Set(script.match(/'[0-9a-f]{32}'/g))).toEqual(
      new Set([current, next].map((body) => `'${md5(body)}'`)),
    );
    // The migration renames "the current function": it must be the 20261013160200 wrapper.
    expect(
      lastDefinerBefore(
        VERSION,
        /\b(create\s+(or\s+replace\s+)?function)\s+api\.get_my_fantasy_points\s*\(/i,
      ),
    ).toBe("20261013160200");
    expect(
      lastDefinerBefore(VERSION, /\brename\s+to\s+get_my_fantasy_points_before_identity\b/i),
    ).toBeUndefined();
    // And it rides in the release bundle the script names.
    const release = read("scripts/backend/apply-20261014-sofascore-rating-release.sql");
    expect(release).toContain("values ('20261013160200'");
    expect(release).not.toContain(VERSION);
  });

  test("the migration renames once, wraps once, and keeps the callers", () => {
    const statements = statementsOf(migration);
    expect(statements).toContain(
      "alter function api.get_my_fantasy_points(uuid, uuid) rename to get_my_fantasy_points_before_identity;",
    );
    expect(statements).toContain(
      "revoke all on function api.get_my_fantasy_points_before_identity(uuid, uuid)\n  from public, anon, authenticated, service_role;",
    );
    expect(
      [...statements.matchAll(/create function ([a-z_.]+\([^)]*\))/g)].map((m) => m[1]),
    ).toEqual(["api.get_my_fantasy_points(p_team_id uuid, p_gameweek_id uuid)"]);
    expect(statements).toContain(
      "revoke all on function api.get_my_fantasy_points(uuid, uuid) from public, anon;",
    );
    expect(statements).toContain(
      "grant execute on function api.get_my_fantasy_points(uuid, uuid) to authenticated, service_role;",
    );
    // A read: no table is created or written.
    expect(statements).not.toMatch(
      /\bcreate\s+table\b|\balter\s+table\b|\binsert\s+into\b|\bupdate\s+(app|app_private)\b|\bdelete\s+from\b|\bcron\./i,
    );
    // The new outer function keeps the step-up guard of the ones it wraps.
    expect(statements).toContain("perform app_private.assert_mfa_step_up();");
    // The script's renamed-function name is the migration's.
    expect(script).toContain("api.get_my_fantasy_points_before_identity(uuid,uuid)");
  });

  test("the preflight covers every table, column and function the new body reads", () => {
    const body = statementsOf(bodyOf(migration, SIGNATURE));
    const relations = new Set(
      [...body.matchAll(/\b(?:from|join)\s+(app\.[a-z_]+)/g)].map((match) => match[1]),
    );
    expect([...relations].sort()).toEqual([
      "app.fantasy_players",
      "app.fantasy_positions",
      "app.players",
      "app.teams",
    ]);
    for (const relation of relations) {
      expect({ relation, checked: preflight.includes(`('${relation}', `) }).toEqual({
        relation,
        checked: true,
      });
    }
    for (const column of [
      "football_player_id",
      "football_team_id",
      "position_id",
      "display_name",
      "short_name",
      "code",
    ]) {
      expect({
        column,
        read: body.includes(column),
        checked: preflight.includes(`'${column}')`),
      }).toEqual({
        column,
        read: true,
        checked: true,
      });
    }
    expect(preflight).toContain("('app_private.assert_mfa_step_up()')");
    expect(preflight).toContain("('api.get_my_fantasy_points_before_staged(uuid,uuid)')");
  });

  test("says plainly what to pause: nothing, because it writes no table", () => {
    const header = script.slice(0, script.indexOf("\nbegin;\n"));
    expect(header).toContain("Nothing needs pausing, because this script writes no table at all");
    expect(header).toContain("Run it ONCE");
    // The new function and the one it wraps belong to the same owner.
    expect(postflight).toContain("inner_fn.proowner is distinct from fn.proowner");
    expect(postflight).toContain("the new function and the wrapped one have different owners");
    expect(read("docs/production/PHASE_A_B_MIGRATIONS_OWNER_RUNBOOK.md")).toContain(
      "as same_owner",
    );
    expect(header).toContain("CURRENT club");
    expect(header).toContain("apply-20261014-sofascore-rating-release.sql");
    // It never calls the function (a signed-in manager is needed, and it is not a check of data).
    expect(statementsOf(script.replace(migration, ""))).not.toMatch(
      /\bapi\.get_my_fantasy_points\s*\(\s*[^)]/,
    );
  });
});
