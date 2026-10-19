import { describe, expect, test } from "bun:test";
import {
  NEW_FUNCTIONS,
  NEW_TRIGGERS,
  PINS,
  REQUIRED_MIGRATIONS,
  build,
  newFunctionPins,
} from "./build-apply-20261016110000-fantasy-finalizing-guard";
import {
  between,
  bodyOf,
  commonApplyScriptTests,
  lastDefinerBefore,
  md5,
  migrationFiles,
  occurrences,
  read,
  statementsOf,
} from "./apply-script-kit";

/**
 * The guarded script that puts 20261016110000 (a finalizing gameweek's scoring inputs cannot change
 * underneath it; audit finding SEC-01) on production. The migration adds three functions and three
 * triggers and replaces nothing, so the pins here are of two kinds: the md5 of the source of the six
 * existing functions it relies on, and the md5 of the three it creates, all recomputed from the
 * repository files and not from the builder's own output.
 */

const VERSION = "20261016110000";
const NAME = "fantasy_finalizing_scoring_inputs_guard";
const SCRIPT_PATH = "scripts/backend/apply-20261016110000-fantasy-finalizing-guard.sql";
const RUNBOOK = "docs/production/FANTASY_FINALIZING_GUARD_OWNER_RUNBOOK.md";
const script = read(SCRIPT_PATH);
const migration = read(`supabase/migrations/${VERSION}_${NAME}.sql`);
const header = script.slice(0, script.indexOf("\nbegin;\n"));
const preflight = between(script, "do $preflight$", "$preflight$;");
const postflight = between(script, "do $postflight$", "$postflight$;");
const executable = statementsOf(migration);

const pinsByHand: Record<string, { file: string; header: RegExp }> = {
  "app_private.fantasy_guard_unfinished_price_catalog()": {
    file: "20261009091728_fantasy_durable_progression.sql",
    header: /create function app_private\.fantasy_guard_unfinished_price_catalog\(\)/,
  },
  "app_private.fantasy_guard_unfinished_close_price_catalog()": {
    file: "20261013160200_staged_stats_progression.sql",
    header: /create function app_private\.fantasy_guard_unfinished_close_price_catalog\(\)/,
  },
  "app_private.fantasy_enforce_player_rules()": {
    file: "20260720163222_fantasy_ruleset_v1.sql",
    header: /create or replace function app_private\.fantasy_enforce_player_rules\(\)/,
  },
  "app_private.fantasy_assert_scoring_snapshot(uuid,bigint,text)": {
    file: "20260927094823_adaptive_fantasy_scoring.sql",
    header: /create or replace function app_private\.fantasy_assert_scoring_snapshot\(/,
  },
  "app_private.sofascore_create_catalog_player(uuid,uuid,text,integer,text)": {
    file: "20261014170000_sofascore_catalog_aliases.sql",
    header: /create function app_private\.sofascore_create_catalog_player\(/,
  },
  "api.service_sofascore_auto_map_players(uuid,jsonb)": {
    file: "20261014170000_sofascore_catalog_aliases.sql",
    header: /create or replace function api\.service_sofascore_auto_map_players\(/,
  },
};

const fieldsOf = (text: string, alias: string) =>
  [
    ...new Set([...text.matchAll(new RegExp(`\\b${alias}\\.([a-z_]+)`, "g"))].map((m) => m[1]!)),
  ].sort();

describe("apply-20261016110000-fantasy-finalizing-guard.sql", () => {
  commonApplyScriptTests({
    version: VERSION,
    name: NAME,
    scriptPath: SCRIPT_PATH,
    runbook: RUNBOOK,
    pauseText: "So the script STOPS, before writing anything, unless these three are paused",
    guards: [
      "the Fantasy lifecycle tick is on -- pause it first",
      "the football live refresh is on -- pause it first",
      "the account-deletion tick is on -- pause it first",
      "the Fantasy worker holds its lease",
      "the finalizing guard already exists",
      "the database is missing the Fantasy tables or functions this update needs",
      "is not the reviewed one",
      "the base scoring input document no longer lists the Fantasy pool and the lineups",
      "the scoring input document no longer reads what this guard covers",
      "perform set_config('bg.fgg_functions_before'",
      "perform set_config('bg.fgg_triggers_before'",
      "perform set_config('bg.fgg_rows_before'",
      "perform set_config('bg.fgg_cron_jobs_before'",
    ],
  });

  test("is exactly what the builder makes from the migration file", () => {
    expect(script).toBe(build());
  });

  test("pins the six functions it relies on to the repository's latest definitions", () => {
    expect(PINS.map((pin) => pin.signature).sort()).toEqual(Object.keys(pinsByHand).sort());
    for (const [signature, pin] of Object.entries(pinsByHand)) {
      const source = read(`supabase/migrations/${pin.file}`);
      const sourceMd5 = md5(bodyOf(source, pin.header));
      expect(occurrences(script, `('${signature}', '${sourceMd5}',`)).toBe(1);
      // Nothing later redefines it (a later definition would make the pin stale).
      const name = signature.slice(signature.indexOf(".") + 1, signature.indexOf("("));
      expect({
        signature,
        definer: lastDefinerBefore(
          "99999999999999",
          new RegExp(`\\bfunction\\s+${signature.split(".")[0]}\\.${name}\\s*\\(`, "i"),
        ),
      }).toEqual({ signature, definer: pin.file.split("_")[0] });
    }
    // None of the six is patched in place by a later migration (pg_get_functiondef + execute).
    const patched = migrationFiles().filter((file) => {
      const text = read(`supabase/migrations/${file}`);
      return Object.keys(pinsByHand).some((signature) => {
        const name = signature.slice(signature.indexOf(".") + 1, signature.indexOf("("));
        return new RegExp(`pg_get_functiondef\\([^)]*${name}`).test(text);
      });
    });
    expect(patched).toEqual([]);
  });

  test("pins the three functions it creates to the migration, and checks them after", () => {
    expect(NEW_FUNCTIONS).toHaveLength(3);
    for (const fn of newFunctionPins(migration)) {
      expect(occurrences(script, `('${fn.signature}', '${fn.md5}')`)).toBe(1);
      expect(md5(bodyOf(migration, fn.header))).toBe(fn.md5);
    }
    expect(postflight).toContain("def.proconfig is distinct from array['search_path=\"\"']");
    expect(postflight).toContain("not def.prosecdef");
    expect(postflight).toContain(
      "def.public_exec or def.anon_exec or def.authenticated_exec or def.service_exec",
    );
  });

  test("checks the three triggers: table, function, BEFORE ROW, events, columns, enabled", () => {
    expect(NEW_TRIGGERS).toHaveLength(3);
    // tgtype: ROW 1 + BEFORE 2 + INSERT 4 + DELETE 8 + UPDATE 16.
    for (const t of NEW_TRIGGERS) {
      expect(preflight).toContain(`'${t.name}'`);
      expect(postflight).toContain(
        `('${t.name}', '${t.table}', '${t.fn}', ${t.tgtype}, '${t.columns}')`,
      );
    }
    expect(NEW_TRIGGERS.map((t) => t.tgtype)).toEqual([31, 31, 11]);
    expect(postflight).toContain("def.tgenabled <> 'O'");
    expect(postflight).toContain("def.tgnargs <> 0 or not def.no_when");
  });

  test("the guard watches exactly the columns the two existing price guards watch, and the document's", () => {
    const durable = read("supabase/migrations/20261009091728_fantasy_durable_progression.sql");
    expect(durable).toContain(
      "before insert or delete or update of id, fantasy_season_id, football_player_id, football_team_id, position_id\non app.fantasy_players",
    );
    expect(migration).toContain(
      "before insert or delete or update of id, fantasy_season_id, football_player_id, football_team_id, position_id\non app.fantasy_players for each row execute function app_private.fantasy_guard_finalizing_player_catalog();",
    );
    expect(migration).toContain(
      "before insert or delete or update of player_id, team_id, season_id, valid_from, valid_to\non app.team_memberships for each row execute function app_private.fantasy_guard_finalizing_squad_membership();",
    );
    expect(migration).toContain(
      "before delete on app.fantasy_lineups\nfor each row execute function app_private.fantasy_guard_finalizing_lineups();",
    );
    // The no-change early returns compare the same lists.
    expect(migration).toContain(
      "row(old.id, old.fantasy_season_id, old.football_player_id,\n      old.football_team_id, old.position_id) is not distinct from",
    );
    expect(migration).toContain(
      "row(old.player_id, old.team_id, old.season_id, old.valid_from, old.valid_to)",
    );

    // What the scoring input document reads of the pool and of the memberships (the latest chain).
    const documentHeader =
      /create or replace function app_private\.fantasy_scoring_input_document\(/;
    const base = bodyOf(
      read("supabase/migrations/20260926101555_fantasy_fixture_time_team_reconciliation.sql"),
      documentHeader,
    );
    const adaptive = bodyOf(
      read("supabase/migrations/20260927120659_adaptive_reviewed_estimates.sql"),
      documentHeader,
    );
    const live = bodyOf(
      read("supabase/migrations/20260927145230_fantasy_live_participation_scope.sql"),
      documentHeader,
    );
    const poolColumns = [
      "fantasy_season_id",
      "football_player_id",
      "football_team_id",
      "id",
      "position_id",
    ];
    expect(fieldsOf(base, "fp")).toEqual(poolColumns);
    expect(fieldsOf(adaptive, "fp")).toEqual(poolColumns);
    // price, status, eligible, active, selected_by_count, price_version are not read.
    expect(fieldsOf(adaptive, "membership")).toEqual([
      "player_id",
      "season_id",
      "team_id",
      "valid_from",
      "valid_to",
    ]);
    expect(base).toContain(
      "from app.fantasy_players fp join app.fantasy_positions pos on pos.id=fp.position_id",
    );
    expect(base).toContain("where fp.fantasy_season_id=fs.id");
    // Lineups: the count and the digest of the gameweek.
    expect(base).toContain(
      "'lineupCount',(select count(*) from app.fantasy_lineups l where l.gameweek_id=gw.id)",
    );
    // The wrappers read no other player table.
    for (const text of [base, adaptive, live]) {
      expect(text).not.toMatch(/app\.players\b/);
      expect(text).not.toMatch(/app\.fantasy_squad_memberships/);
    }
    // The preflight checks the same in production.
    expect(preflight).toContain("'from app\\.fantasy_players fp join app\\.fantasy_positions pos'");
    expect(preflight).toContain("'app\\.team_memberships membership'");
    expect(preflight).toContain("p.proname like 'fantasy\\_scoring\\_input\\_document%'");
  });

  test("the migration only creates: three functions, three triggers, no data, no existing object changed", () => {
    expect(
      [...executable.matchAll(/\bcreate\s+(function|trigger)\s+([a-z_.]+)/gi)].map(
        (m) => `${m[1]} ${m[2]}`,
      ),
    ).toEqual([
      "function app_private.fantasy_guard_finalizing_player_catalog",
      "trigger fantasy_players_guard_finalizing_inputs",
      "function app_private.fantasy_guard_finalizing_squad_membership",
      "trigger team_memberships_guard_finalizing_inputs",
      "function app_private.fantasy_guard_finalizing_lineups",
      "trigger fantasy_lineups_guard_finalizing_inputs",
    ]);
    expect(executable).not.toMatch(
      /\bcreate\s+or\s+replace\b|\binsert\s+into\b|\bupdate\s+(app|app_private)\.|\bdelete\s+from\b|\bdrop\b|\balter\b|\bgrant\b|\btruncate\b|\bcron\./i,
    );
    // Each function is locked down the way the existing guards are.
    expect(occurrences(executable, "security definer set search_path = ''")).toBe(3);
    for (const fn of NEW_FUNCTIONS) {
      expect(migration).toContain(
        `revoke all on function ${fn.signature}\n  from public, anon, authenticated, service_role;`,
      );
    }
    // The original guard introduced this code; the reviewed fixture/performance
    // follow-up deliberately uses the same stable refusal for frozen inputs.
    expect(
      occurrences(migration, "errcode = 'PT409', message = 'fantasy_scoring_inputs_frozen'"),
    ).toBe(3);
    for (const file of migrationFiles()) {
      if (
        file.startsWith(VERSION) ||
        file === "20261019073221_fantasy_finalizing_fixture_performance_guard.sql"
      )
        continue;
      expect({
        file,
        uses: read(`supabase/migrations/${file}`).includes("fantasy_scoring_inputs_frozen"),
      }).toEqual({
        file,
        uses: false,
      });
    }
  });

  test("each trigger takes FOR KEY SHARE on the season's current gameweek row before it reads the status", () => {
    const code = migration.replace(/--[^\n]*/g, "");
    expect(occurrences(code, "for key share")).toBe(3);
    expect(
      occurrences(code, "gw.status in ('open', 'locked', 'live', 'provisional', 'finalizing')"),
    ).toBe(3);
    // The lock is taken first and the status is read from the locked row, never by a separate EXISTS.
    expect(code).not.toMatch(/exists\s*\(\s*select[^;]*status\s*=\s*'finalizing'/i);
    for (const fn of NEW_FUNCTIONS) {
      const body = bodyOf(migration, fn.header);
      expect(body.indexOf("for key share")).toBeGreaterThan(-1);
      expect(body.indexOf("for key share")).toBeLessThan(body.indexOf("raise exception"));
      expect(body).toContain("if week_status = 'finalizing' then");
    }
    // The membership guard looks the pool up first and takes the lock only for a pooled player.
    const membership = bodyOf(migration, NEW_FUNCTIONS[1].header);
    expect(membership.indexOf("pool_seasons")).toBeLessThan(membership.indexOf("for key share"));
    expect(membership).toContain("if pool_seasons is not null then");
    // Only the finalization moves a gameweek to finalizing, and it locks the row FOR UPDATE first.
    const begin = read("supabase/migrations/20260914200719_fantasy_scoring_worker_contracts.sql");
    const at = begin.indexOf("create function api.service_begin_fantasy_finalization(");
    expect(at).toBeGreaterThan(-1);
    const fn = begin.slice(at, begin.indexOf("revoke all", at));
    expect(
      fn.indexOf("from app.fantasy_gameweeks where id=p_gameweek_id for update"),
    ).toBeGreaterThan(-1);
    expect(fn.indexOf("for update")).toBeLessThan(fn.indexOf("set status='finalizing'"));
    // One current gameweek per season, so the lock is one row.
    expect(read("supabase/migrations/20260720141826_fantasy_catalog_rules.sql")).toContain(
      "where status in ('open', 'locked', 'live', 'provisional', 'finalizing')",
    );
    for (const file of migrationFiles()) {
      if (file.startsWith(VERSION)) continue;
      const text = read(`supabase/migrations/${file}`).replace(/--[^\n]*/g, "");
      expect({ file, flips: /set\s+status\s*=\s*'finalizing'/i.test(text) }).toEqual({
        file,
        flips: [
          "20260720163222_fantasy_ruleset_v1.sql",
          "20260914200719_fantasy_scoring_worker_contracts.sql",
        ].includes(file),
      });
    }
  });

  test("the guard fires after every existing guard of the pool, so each keeps its own answer", () => {
    // Triggers of one kind fire in name order (C collation).
    const mine = "fantasy_players_guard_finalizing_inputs";
    for (const existing of [
      "fantasy_guard_unfinished_close_price_catalog",
      "fantasy_guard_unfinished_price_catalog",
      "fantasy_players_enforce_rules",
    ]) {
      expect(existing < mine).toBe(true);
    }
    // And fantasy_players_set_updated_at sorts after it: it only touches updated_at on a row already allowed.
    expect(mine < "fantasy_players_set_updated_at").toBe(true);
  });

  test("the SofaScore matcher holds a refused player instead of failing, as the migration says", () => {
    const matcher = bodyOf(
      read("supabase/migrations/20261014170000_sofascore_catalog_aliases.sql"),
      /create or replace function api\.service_sofascore_auto_map_players\(/,
    );
    // The creation, the mapping and the log row are inside one BEGIN ... EXCEPTION WHEN OTHERS block ...
    const create = matcher.indexOf("v_creation := app_private.sofascore_create_catalog_player(");
    const handler = matcher.indexOf("exception when others then", create);
    expect(create).toBeGreaterThan(0);
    expect(handler).toBeGreaterThan(create);
    expect(matcher.lastIndexOf("begin", create)).toBeGreaterThan(
      matcher.indexOf("Nobody in the catalog: create him"),
    );
    // ... which counts the failure and falls through to the queue instead of raising.
    const afterHandler = matcher.slice(handler, handler + 400);
    expect(afterHandler).toContain("v_create_failed := v_create_failed + 1;");
    expect(afterHandler).not.toMatch(/\braise\b/);
    expect(matcher).toContain("'created', v_created, 'createFailed', v_create_failed");
    expect(matcher).toContain("v_reason, v_cands);\n      v_queued := v_queued + 1;");
    // The creation inserts the pool entry (the row the guard refuses) after his membership.
    const creator = bodyOf(
      read("supabase/migrations/20261014170000_sofascore_catalog_aliases.sql"),
      /create function app_private\.sofascore_create_catalog_player\(/,
    );
    expect(creator.indexOf("insert into app.team_memberships")).toBeGreaterThan(-1);
    expect(creator.indexOf("insert into app.fantasy_players")).toBeGreaterThan(
      creator.indexOf("insert into app.team_memberships"),
    );
    // The Edge caller reads the answer and never throws on a database error from the matcher.
    const caller = read("supabase/functions/_shared/sofascore-fantasy-auto.ts");
    expect(caller).toContain(
      "return { label: `error:${safeLabel(result.error.message)}`, mappedAny: false };",
    );
    // The migration documents it.
    expect(migration).toContain("THE SOFASCORE MATCHER HOLDS INSTEAD OF FAILING");
  });

  test("account erasure is the only deleter of lineups and its worker releases a refused request", () => {
    const deleters = migrationFiles().filter((file) =>
      /\bdelete\s+from\s+app\.fantasy_lineups\b/i.test(
        statementsOf(read(`supabase/migrations/${file}`)),
      ),
    );
    expect(deleters).toEqual(["20261006143700_account_deletion_automatic.sql"]);
    const worker = read("supabase/functions/_shared/account-deletion-worker.ts");
    expect(worker).toContain(
      'await rpc(dependencies.client, "service_release_account_deletion", {',
    );
    const release = read("supabase/migrations/20261006143700_account_deletion_automatic.sql");
    expect(release).toContain(
      "case when p_error ~ '^[a-z0-9_]{1,80}$' then p_error else 'worker_failed' end",
    );
    expect("fantasy_scoring_inputs_frozen").toMatch(/^[a-z0-9_]{1,80}$/);
    // The worker passes on only account_deletion_* messages, so last_error reads database_unavailable.
    expect(worker).toContain("const ERROR_CODE = /^account_deletion_[a-z_]{1,60}$/;");
    expect("fantasy_scoring_inputs_frozen").not.toMatch(/^account_deletion_[a-z_]{1,60}$/);
  });

  test("pauses what writes these tables, copied from AGENTS.md, and the script refuses while they are on", () => {
    const agents = read("AGENTS.md");
    for (const command of [
      "select app_private.fantasy_automation_configure(false);",
      "select app_private.notification_email_configure('off', null, null, false);",
      "select holder, expires_at, released_at from app_private.fantasy_worker_lease",
    ]) {
      expect(agents).toContain(command);
      expect(header).toContain(command);
    }
    // Account erasure is a required pause; Pépites and the Manager Card are explained, with AGENTS.md's commands.
    for (const command of [
      "select app_private.account_deletion_configure(false);",
      "select app_private.pepites_configure('off', null);",
      "select app_private.manager_card_configure(false, null);",
      "select app_private.manager_card_configure(true, null);",
    ]) {
      expect(agents).toContain(command);
      expect(header).toContain(command);
    }
    expect(header).toContain("select app_private.account_deletion_configure(true);");
    // The final "Applied" row tells the owner to restore all three switches.
    const applied = script.slice(script.indexOf("then 'Applied."), script.indexOf("as result;"));
    expect(applied).toContain("select app_private.fantasy_automation_configure(true);");
    expect(applied).toContain("select app_private.account_deletion_configure(true);");
    expect(header).toContain("they need not be paused");
    expect(preflight).toContain("from app_private.account_deletion_settings s where s.enabled");
    expect(header).toContain("select app_private.fantasy_automation_configure(true);");
    expect(header).toContain("fantasy-lifecycle-tick");
    expect(header).toContain("fantasy-worker-tick");
    expect(header).toContain("football-live-refresh");
    expect(header).toContain("account-deletion tick");
    expect(preflight).toContain(
      "from app_private.fantasy_automation_settings s where s.lifecycle_tick_enabled",
    );
    expect(preflight).toContain(
      "from app_private.notification_email_settings s where s.football_live_refresh_enabled",
    );
    expect(preflight).toContain("l.released_at is null and l.expires_at > statement_timestamp()");
    // The same switches as the player-list update's own refusal (fantasy_tick_must_be_paused).
    expect(read("supabase/migrations/20260925200000_current_player_list_update.sql")).toContain(
      "settings.lifecycle_tick_enabled",
    );
  });

  test("requires the migrations whose objects it pins", () => {
    expect(REQUIRED_MIGRATIONS).toEqual([
      "20260927094823",
      "20261009091728",
      "20261013160200",
      "20261014170000",
    ]);
    for (const required of REQUIRED_MIGRATIONS) {
      expect(migrationFiles().some((file) => file.startsWith(`${required}_`))).toBe(true);
      expect(preflight).toContain(`'${required}'`);
    }
  });

  test("never writes the three tables, calls a worker, or sends anything", () => {
    const outside = statementsOf(script.replace(migration, ""));
    expect(outside).not.toMatch(
      /\b(insert\s+into|update|delete\s+from)\s+app\.(fantasy_players|team_memberships|fantasy_lineups)\b/i,
    );
    expect(outside).not.toMatch(
      /\bfantasy_(worker_tick|lifecycle_tick)\s*\(|\bservice_[a-z_]+\s*\(|\bnet\.http/i,
    );
  });

  test("a runbook and a database test ship with it", () => {
    const runbook = read(RUNBOOK);
    expect(runbook).toContain(SCRIPT_PATH);
    expect(runbook).toContain("fantasy_scoring_inputs_frozen");
    expect(runbook).toContain("Rolling back");
    expect(runbook).toContain("select app_private.fantasy_automation_configure(false);");
    expect(runbook).toContain(
      "select app_private.notification_email_configure('off', null, null, false);",
    );
    const test = read("supabase/tests/database/fantasy_finalizing_scoring_inputs_guard.test.sql");
    expect(test).toContain("fantasy_scoring_inputs_frozen");
    expect(test).toContain("service_sofascore_auto_map_players");
  });
});
