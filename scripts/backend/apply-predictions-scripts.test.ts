import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The guarded scripts the owner runs in the Supabase SQL editor to put
 * Pronostics (BG-0146) on production: parts 1 to 5 together, and part 6 (the
 * Fantasy league page) on its own once Fantasy gameweek 1 is scored.
 *
 * Each script records every migration file whole in the history, then runs
 * that record only after its sha256 matches the repository file. So each file
 * must be carried byte for byte, once, and the hash the script checks must be
 * the file's. A migration edited after the script was built fails here, not
 * on production. Both scripts must stay rehearsals unless edited on purpose.
 */

const root = join(import.meta.dir, "../..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const occurrences = (haystack: string, needle: string) => haystack.split(needle).length - 1;

const PARTS = [
  ["20260925090000", "predictions_schema"],
  ["20260925090100", "predictions_rules"],
  ["20260925090200", "predictions_api"],
  ["20260925090300", "predictions_leagues"],
  ["20260925090400", "predictions_scoring"],
] as const;
const LEAGUE_PAGE = ["20260925090500", "fantasy_league_page_skip_empty"] as const;

const scripts = {
  predictions: read("scripts/backend/apply-20260925090000-predictions.sql"),
  leaguePage: read("scripts/backend/apply-20260925090500-fantasy-league-page-skip-empty.sql"),
};

function expectCarried(script: string, version: string, name: string) {
  const migration = read(`supabase/migrations/${version}_${name}.sql`);
  const tag = `$bg_${version}_file$`;
  expect(migration).not.toContain(tag);
  // Once, whole, as the history row's statements[1] -- and nowhere else.
  expect(occurrences(script, migration)).toBe(1);
  expect(script).toContain(`array[${tag}${migration}${tag}]`);
  expect(script).toContain(`  '${version}',\n  '${name}',\n  array[${tag}`);
  // Run only once the recorded text is the repository file.
  expect(script).toContain(
    `if encode(sha256(convert_to(part_${version}, 'UTF8')), 'hex')\n    is distinct from '${sha256(migration)}' then`,
  );
  expect(occurrences(script, `execute part_${version};`)).toBe(1);
}

function expectRehearsal(script: string) {
  const lines = script.split("\n").map((line) => line.trim());
  expect(lines.filter((line) => line === "rollback;")).toHaveLength(1);
  expect(lines.filter((line) => line === "commit;")).toHaveLength(0);
  expect(lines.filter((line) => line === "begin;")).toHaveLength(1);
}

function expectGuardsFirst(script: string, guards: readonly string[]) {
  const firstWrite = script.indexOf("insert into supabase_migrations.schema_migrations");
  expect(firstWrite).toBeGreaterThan(0);
  for (const guard of guards) {
    const at = script.indexOf(guard);
    expect({ guard, found: at !== -1 }).toEqual({ guard, found: true });
    expect({ guard, beforeFirstWrite: at < firstWrite }).toEqual({ guard, beforeFirstWrite: true });
  }
}

describe("apply-20260925090000-predictions.sql (parts 1 to 5)", () => {
  test("carries each migration byte for byte and checks it before running it", () => {
    for (const [version, name] of PARTS) expectCarried(scripts.predictions, version, name);
  });

  test("runs them in their order, after every hash has been checked", () => {
    const positions = PARTS.map(([version]) =>
      scripts.predictions.indexOf(`  execute part_${version};`),
    );
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    const lastCheck = scripts.predictions.lastIndexOf("is not the repository file byte for byte");
    expect(lastCheck).toBeLessThan(positions[0]!);
  });

  test("does not apply part 6, which waits for Fantasy gameweek 1", () => {
    const partSix = read(`supabase/migrations/${LEAGUE_PAGE[0]}_${LEAGUE_PAGE[1]}.sql`);
    expect(scripts.predictions).not.toContain(partSix);
    expect(scripts.predictions).not.toContain(`'${LEAGUE_PAGE[0]}',\n`);
  });

  test("ships as a rehearsal: one rollback, no commit", () => {
    expectRehearsal(scripts.predictions);
  });

  test("refuses to run twice and bounds its locks before writing anything", () => {
    expectGuardsFirst(scripts.predictions, [
      "set local lock_timeout = '5s';",
      "set local statement_timeout = '120s';",
      "is already recorded as applied",
      "app.predictions already exists",
      "migration 20260924160000 (account bans)",
      "a Pronostics scheduled job already exists",
    ]);
  });

  test("checks that the game is installed switched off, and reads it as a visitor", () => {
    expect(scripts.predictions).toContain("the game is not installed switched off");
    expect(scripts.predictions).toContain("answer := api.predictions_round(null, 'fr');");
  });
});

describe("apply-20260925090500-fantasy-league-page-skip-empty.sql (part 6)", () => {
  test("carries the migration byte for byte and checks it before running it", () => {
    expectCarried(scripts.leaguePage, LEAGUE_PAGE[0], LEAGUE_PAGE[1]);
  });

  test("ships as a rehearsal: one rollback, no commit", () => {
    expectRehearsal(scripts.leaguePage);
  });

  test("waits for parts 1 to 5, for Fantasy gameweek 1 to be scored, and for the Fantasy tick to be paused", () => {
    expectGuardsFirst(scripts.leaguePage, [
      "set local lock_timeout = '5s';",
      "migration 20260925090500 is already recorded as applied",
      "Pronostics parts 1 to 5 are not applied yet",
      "where sequence_number = 1 and finalized_at is not null and points_state = 'final'",
      // AGENTS.md's pause, which parts 1 to 5 went in without.
      "stop: the Fantasy lifecycle tick is on",
      // The version production held on 2026-09-24 (20260914200719), measured there.
      ")) <> '021d0a3422cf68d4c213b028974888d2' then",
    ]);
  });

  test("checks the new version is in place and callable by the service role only", () => {
    expect(scripts.leaguePage).toContain(
      "if md5(pg_get_functiondef(signature)) <> '7f79f52c973b0cf888ee8c6c2b927573' then",
    );
    expect(scripts.leaguePage).toContain("the league page is callable by the wrong roles");
  });
});
