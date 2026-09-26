import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The owner's procedure for a Fantasy gameweek held by a counted match that
 * was not completed within the 48 h the rules keep it there, whatever held it
 * (postponed, cancelled, abandoned, moved, suspended, never started, stuck
 * live): scripts/backend/resolve-fantasy-postponed-assignment.sql. It must do
 * nothing useful by accident: run as shipped it lists the candidates and
 * saves nothing; with a target it is a dry run that exercises the real tool
 * and ends with a deliberate raise (CLAUDE.md); only an edit of one line
 * saves. The listing only reads and needs nothing paused; from the dry run on
 * it must refuse while the Fantasy tick is on (AGENTS.md). It must list
 * exactly the matches the ops check holds against a gameweek, and make no
 * write but the reviewed tool's.
 */

const root = join(import.meta.dir, "../..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const occurrences = (haystack: string, needle: string) => haystack.split(needle).length - 1;

const script = read("scripts/backend/resolve-fantasy-postponed-assignment.sql");
const tool = read("supabase/migrations/20260926003500_fantasy_resolve_postponed_after_lock.sql");
const opsCheck = read(
  "supabase/migrations/20260926003400_ops_health_fantasy_coverage_and_scoring.sql",
);
const leaguePolicyScript = read(
  "scripts/backend/apply-20260926003200-league-policy-and-fk-indexes.sql",
);
/** AGENTS.md with its line wrapping undone. */
const agents = read("AGENTS.md").replace(/\s+/g, " ");
/** The instructions: the comment block before the first statement. */
const header = script.slice(0, script.indexOf("\ndo $resolve$\n"));
/** The same, as prose: comment markers and line wrapping undone. */
const prose = header.replace(/^-- ?/gm, "").replace(/\s+/g, " ");
const block = script.slice(
  script.indexOf("do $resolve$"),
  script.indexOf("$resolve$;") + "$resolve$;".length,
);
const afterBlock = script.slice(script.indexOf("$resolve$;") + "$resolve$;".length);

/**
 * SQL with its comments dropped and its string literals blanked to `''`, read
 * left to right so that `--` inside a literal and an apostrophe inside a
 * comment are each taken for what they are.
 */
const statementsOf = (sql: string) => {
  let out = "";
  let i = 0;
  while (i < sql.length) {
    if (sql.startsWith("--", i)) {
      const end = sql.indexOf("\n", i);
      i = end === -1 ? sql.length : end;
    } else if (sql[i] === "'") {
      let j = i + 1;
      while (j < sql.length && !(sql[j] === "'" && sql[j + 1] !== "'")) j += sql[j] === "'" ? 2 : 1;
      out += "''";
      i = j + 1;
    } else {
      out += sql[i];
      i += 1;
    }
  }
  return out;
};
/** Whitespace folded, to compare predicates written over several lines. */
const folded = (sql: string) => sql.replace(/\s+/g, " ");

describe("resolve-fantasy-postponed-assignment.sql", () => {
  test("as shipped it saves nothing: no target, dry run on, and no transaction control of its own", () => {
    expect(occurrences(block, "  target_assignment constant uuid := null;\n")).toBe(1);
    expect(occurrences(block, "  dry_run constant boolean := true;\n")).toBe(1);
    expect(occurrences(block, "  reason constant text := '';\n")).toBe(1);
    // Without a target it stops at STEP 1, before the tool is called.
    const step1 = block.indexOf("if target_assignment is null then");
    expect(step1).toBeGreaterThan(0);
    expect(block.indexOf("raise exception 'STEP 1, nothing saved.", step1)).toBeGreaterThan(step1);
    expect(step1).toBeLessThan(
      block.indexOf("app_private.fantasy_resolve_frozen_assignment(target_assignment"),
    );
    // The DO block is its own transaction: no begin, commit or rollback that
    // could split it.
    const statements = statementsOf(script);
    expect(statements).not.toMatch(/^\s*(begin|commit|rollback|start\s+transaction)\s*;/im);
    expect(occurrences(statements, "do $resolve$")).toBe(1);
  });

  test("the dry run runs the real tool and then raises on purpose, carrying what it computed", () => {
    const call = block.indexOf(
      "outcome := app_private.fantasy_resolve_frozen_assignment(target_assignment, decision, reason);",
    );
    const dryRun = block.indexOf("  if dry_run then\n    raise exception 'DRY RUN, nothing saved.");
    expect(call).toBeGreaterThan(0);
    expect(dryRun).toBeGreaterThan(call);
    // The raise carries the state before, the tool's answer and what is left.
    expect(block.slice(dryRun, block.indexOf("end if;", dryRun))).toContain(
      "before_state, outcome, outcome ->> 'gameweekSequence', coalesce(left_state, 'nothing');",
    );
    // Nothing after the dry-run raise writes; the save path only reports.
    const afterRaise = statementsOf(block.slice(dryRun));
    expect(afterRaise).not.toMatch(
      /\binsert\s+into\b|\bupdate\s+[a-z_.]+\s+set\b|\bdelete\s+from\b|:= app_private\./i,
    );
    expect(prose).toContain("Change `dry_run constant boolean := true;` to `false`");
  });

  test("its one write is the reviewed tool, with the one decision it accepts", () => {
    const statements = statementsOf(script);
    expect(statements).not.toMatch(
      /\binsert\s+into\b|\bupdate\s+[a-z_.]+\s+set\b|\bdelete\s+from\b|\btruncate\b|\balter\b|\bcreate\b|\bdrop\b|\bgrant\b|\brevoke\b/i,
    );
    expect(occurrences(statements, "app_private.fantasy_resolve_frozen_assignment(")).toBe(1);
    expect(block).toContain("  decision constant text := 'operator_deferred';\n");
    expect(tool).toContain("if p_resolution is distinct from 'operator_deferred' then");
    // The final read runs only after a save and reads the audit trail.
    expect(statementsOf(afterBlock)).toMatch(
      /^\s*select\b[\s\S]*\bfrom app_private\.admin_audit_events audit\b/,
    );
  });

  test("lists without the tick paused, refuses to go further while it is on, and says how to pause and restore it", () => {
    const guard =
      "  if exists (select 1 from app_private.fantasy_automation_settings where lifecycle_tick_enabled) then\n";
    const leagueRaise = leaguePolicyScript.slice(
      leaguePolicyScript.indexOf(guard) + guard.length,
      leaguePolicyScript.indexOf("\n", leaguePolicyScript.indexOf(guard) + guard.length),
    );
    expect(block).toContain(`${guard}${leagueRaise}\n  end if;`);
    expect(occurrences(block, guard)).toBe(1);
    // After the read-only STEP 1 listing has answered, before the target is
    // read and long before the tool is called: the listing needs nothing
    // paused, the dry run and the save do.
    expect(block.indexOf(guard)).toBeGreaterThan(
      block.indexOf("raise exception 'STEP 1, nothing saved."),
    );
    expect(block.indexOf(guard)).toBeLessThan(block.indexOf("into before_state"));
    expect(block.indexOf(guard)).toBeLessThan(
      block.indexOf("app_private.fantasy_resolve_frozen_assignment(target_assignment"),
    );
    // The tool refuses while the tick is on as well, a replay apart.
    expect(tool).toContain("message = 'fantasy_tick_must_be_paused'");
    // The instructions say to pause it after the listing, not before.
    expect(prose.indexOf('It only reads: it stops with "STEP 1"')).toBeGreaterThan(0);
    expect(prose.indexOf("This needs nothing paused.")).toBeLessThan(
      prose.indexOf("select app_private.fantasy_automation_configure(false);"),
    );
    for (const command of [
      "select app_private.fantasy_automation_configure(false);",
      "select app_private.fantasy_automation_configure(true);",
    ]) {
      expect({ command, inHeader: header.includes(command) }).toEqual({ command, inHeader: true });
    }
    expect(agents).toContain("select app_private.fantasy_automation_configure(false);");
    expect(header).toContain(
      "select lifecycle_tick_enabled from app_private.fantasy_automation_settings;",
    );
    expect(prose).toContain("no Fantasy season orchestrator run either");
    expect(block).toContain(
      "if to_regprocedure('app_private.fantasy_resolve_frozen_assignment(uuid,text,text)') is null then",
    );
  });

  test("lists exactly the matches the ops check holds against a gameweek, and the tool accepts", () => {
    const listing = folded(
      block.slice(
        block.indexOf("select string_agg("),
        block.indexOf("if target_assignment is null then"),
      ),
    );
    // The ops check's classes (20260926003400): called off; moved to a kickoff
    // too late for the match to be completed within the rules' window (its
    // kickoff + 2 h past it); anything else unfinished. Finished never.
    expect(folded(opsCheck)).toContain(
      "when f.status = 'finished' then null when f.status in ('postponed', 'cancelled', 'abandoned') then 'called_off' when f.kickoff_at > a.assigned_kickoff_at and f.kickoff_at + interval '2 hours' > r.resolvable_at then 'moved' else 'unfinished' end as hold",
    );
    // What it holds against a gameweek: called off or moved at once, any
    // other 3 h past its due end, and any once the window is over.
    expect(folded(opsCheck)).toContain(
      "k.hold is not null and (k.hold in ('called_off', 'moved') or k.due_end < now_at - interval '3 hours' or k.resolvable_at <= now_at) as held",
    );
    expect(folded(opsCheck)).toContain(
      "when 'unfinished' then f.kickoff_at + interval '2 hours' end as due_end",
    );
    expect(folded(opsCheck)).toContain(
      "a.assigned_kickoff_at + make_interval(hours => coalesce(fixture_rules.post_lock_completion_window_hours, 48)) as resolvable_at",
    );
    // The listing, the same set.
    expect(listing).toContain(
      "and fixture.status <> 'finished' and (fixture.status in ('postponed', 'cancelled', 'abandoned') or (fixture.kickoff_at > assignment.assigned_kickoff_at and fixture.kickoff_at + interval '2 hours' > assignment.assigned_kickoff_at + make_interval(hours => coalesce(fixture_rules.post_lock_completion_window_hours, 48))) or fixture.kickoff_at + interval '2 hours' < statement_timestamp() - interval '3 hours' or assignment.assigned_kickoff_at + make_interval(hours => coalesce(fixture_rules.post_lock_completion_window_hours, 48)) <= statement_timestamp());",
    );
    // The same classes in the tool, which records them and does not decide
    // by them: every unfinished class is refused before the window's end and
    // accepted after it.
    expect(folded(tool)).toContain(
      "when fixture.status = 'finished' then null when fixture.status in ('postponed', 'cancelled', 'abandoned') then 'called_off' when fixture.kickoff_at > target.assigned_kickoff_at and fixture.kickoff_at + interval '2 hours' > resolvable_at then 'moved' else 'unfinished' end;",
    );
    expect(tool).not.toContain("fantasy_fixture_can_still_finish");
    expect(tool).not.toContain("ends_at");
    // It flags a gameweek's last counted match, which the tool refuses.
    expect(listing).toContain(
      "then ', its gameweek''s last counted match: the tool refuses it, a developer is needed'",
    );
    expect(tool).toContain("message = 'fantasy_gameweek_needs_a_fixture'");
    // Counted, current assignments of locked or live gameweeks of a running season.
    for (const scope of [
      "gameweek.status in ('locked', 'live')",
      "season.status in ('registration_open', 'active')",
      "where assignment.superseded_at is null and assignment.counts_points",
    ]) {
      expect({ scope, listed: listing.includes(scope) }).toEqual({ scope, listed: true });
    }
    // Each line names the assignment id the owner copies into the block.
    expect(listing).toContain("-- assignment %s");
  });

  test("the listing says from when each held match can be taken out, as the tool computes it", () => {
    const listing = folded(
      block.slice(
        block.indexOf("select string_agg("),
        block.indexOf("if target_assignment is null then"),
      ),
    );
    // The ruleset's post-lock completion window (48 h, FANTASY_RULES_V1.md)
    // from the kickoff the gameweek locked with, compared as the tool does.
    expect(listing).toContain(
      "left join app.fantasy_fixture_rules fixture_rules on fixture_rules.ruleset_id = season.ruleset_id",
    );
    expect(listing).toContain(
      "when statement_timestamp() < assignment.assigned_kickoff_at + make_interval(hours => fixture_rules.post_lock_completion_window_hours) then 'resolvable from '",
    );
    expect(folded(tool)).toContain(
      "from app.fantasy_fixture_rules fixture_rules where fixture_rules.ruleset_id = season.ruleset_id;",
    );
    expect(folded(tool)).toContain(
      "resolvable_at := target.assigned_kickoff_at + make_interval(hours => window_hours);",
    );
    expect(folded(tool)).toContain("if statement_timestamp() < resolvable_at then");
    expect(folded(tool)).toContain(
      "message = 'fantasy_postponement_window_open: resolvable from '",
    );
    expect(prose).toContain(
      "A fixture completed within 48 hours of its original assignment remains in that gameweek.",
    );
  });

  test("the ops check and the docs name this file", () => {
    expect(opsCheck).toContain(
      "else 'scripts/backend/resolve-fantasy-postponed-assignment.sql takes it out' end;",
    );
    expect(opsCheck).toContain(
      "': take it out with scripts/backend/resolve-fantasy-postponed-assignment.sql'",
    );
    // Not where the tool cannot free the gameweek: its last counted match.
    expect(opsCheck).toContain(
      "': a developer is needed (no tool yet for a gameweek whose every match was called off)'",
    );
    expect(read("docs/operations/ALERTS.md")).toContain(
      "scripts/backend/resolve-fantasy-postponed-assignment.sql",
    );
    expect(read("docs/backend/FANTASY_SEASON_ORCHESTRATION_RUNBOOK.md")).toContain(
      "scripts/backend/resolve-fantasy-postponed-assignment.sql",
    );
  });
});
