import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import {
  build as buildPgTapBlock,
  TEST_PATH,
} from "../../scripts/backend/build-morocco-time-helpers-test";
import * as edge from "../../supabase/functions/_shared/morocco-time";
import { MOROCCO_PERMANENT_UTC_FROM_MS, MOROCCO_TIME_ZONE } from "./morocco-time";

/**
 * Morocco's clock inside the database (migration 20261016090000_morocco_time_helpers) must be the
 * same rule as the application's (src/lib/morocco-time.ts), and no migration written after it may
 * go back to asking the database's own Africa/Casablanca data, which are older than the rule on
 * Production V2 and Staging V2 (docs/engineering/MOROCCO_TIME_IN_THE_DATABASE.md).
 */

const root = join(import.meta.dir, "../..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const HELPER_VERSION = "20261016090000";
const HELPER_FILE = `supabase/migrations/${HELPER_VERSION}_morocco_time_helpers.sql`;

/** A migration with its comments removed (a `--` inside a string is kept). */
function withoutComments(sql: string): string {
  let out = "";
  let i = 0;
  while (i < sql.length) {
    if (sql.startsWith("--", i)) {
      const end = sql.indexOf("\n", i);
      i = end === -1 ? sql.length : end;
    } else if (sql[i] === "'") {
      const start = i;
      i += 1;
      while (i < sql.length) {
        if (sql[i] === "'" && sql[i + 1] === "'") i += 2;
        else if (sql[i] === "'") break;
        else i += 1;
      }
      i += 1;
      out += sql.slice(start, i);
    } else {
      out += sql[i];
      i += 1;
    }
  }
  return out;
}

describe("the database's Morocco constant is the application's", () => {
  const helpers = read(HELPER_FILE);

  test("the instant of the change is the same in SQL, in src/ and in the Edge Functions", () => {
    const sql = /app_private\.morocco_permanent_utc_from\(\)[\s\S]*?timestamptz '([^']+)'/.exec(
      helpers,
    );
    expect(sql).not.toBeNull();
    expect(Date.parse(sql![1]!.replace(" ", "T").replace(/\+00$/, "Z"))).toBe(
      MOROCCO_PERMANENT_UTC_FROM_MS,
    );
    expect(edge.MOROCCO_PERMANENT_UTC_FROM_MS).toBe(MOROCCO_PERMANENT_UTC_FROM_MS);
    // And the date the SQL names in its comments is the date the rule is documented with.
    expect(new Date(MOROCCO_PERMANENT_UTC_FROM_MS).toISOString()).toBe("2026-09-20T01:00:00.000Z");
  });

  test("the legacy zone asked for earlier instants is the application's", () => {
    expect(MOROCCO_TIME_ZONE).toBe("Africa/Casablanca");
    expect(edge.MOROCCO_TIME_ZONE).toBe(MOROCCO_TIME_ZONE);
    const body = withoutComments(helpers);
    const literals = [...body.matchAll(/'(Africa\/[A-Za-z_]+)'/g)].map((m) => m[1]);
    expect(new Set(literals)).toEqual(new Set([MOROCCO_TIME_ZONE]));
    // The zone helpers match the name the way PostgreSQL does, without regard to case.
    expect(body).toContain(`lower(p_zone) = '${MOROCCO_TIME_ZONE.toLowerCase()}'`);
  });

  test("the rule has no second change: after the instant the answer is UTC, always", () => {
    const zoneName = /function app_private\.morocco_zone_name[\s\S]*?\$\$([\s\S]*?)\$\$/.exec(
      helpers,
    );
    expect(zoneName![1]).toContain(
      "when p_at >= app_private.morocco_permanent_utc_from() then 'UTC'",
    );
    expect(zoneName![1]).toContain("else 'Africa/Casablanca'");
    expect(zoneName![1]).not.toMatch(/\bwhen\b[\s\S]*\bwhen\b/);
  });

  test("the helpers are owner-only, never volatile, and pinned to an empty search_path", () => {
    const definitions =
      helpers.match(/create or replace function app_private\.\w+\([^$]*\$\$/g) ?? [];
    expect(definitions).toHaveLength(10);
    for (const definition of definitions) {
      expect(definition).toMatch(/set search_path = ''/);
      expect(definition).toMatch(/security invoker/);
      expect(definition).not.toMatch(/\bvolatile\b/);
    }
    expect(helpers).toContain("from public, anon, authenticated, service_role;");
    expect(helpers).toMatch(/to postgres;\s*$/);
  });
});

describe("the pgTAP expectations are the application's rule", () => {
  test("the generated block of morocco_time_helpers.test.sql equals tests/timezone-parity/expected.json", () => {
    expect(read(TEST_PATH)).toBe(buildPgTapBlock());
  });
});

describe("no migration after the helpers asks the database for the Moroccan zone", () => {
  const newer = readdirSync(join(root, "supabase/migrations"))
    .filter((file) => file.endsWith(".sql") && file.split("_")[0]! > HELPER_VERSION)
    .sort();

  /**
   * The literal is allowed only as the default value of a function parameter: `create or replace`
   * must repeat a default it cannot remove (api.football_matches_by_date's p_timezone), and it is
   * a name the caller may pass, never a conversion.
   */
  const ALLOWED_LINE = /^\s*p_timezone\s+text\s+default\s+'Africa\/Casablanca',?\s*$/;
  const ZONE = /africa\/(casablanca|el_aaiun)/i;

  test("lists the migrations it checks (and is not empty once the next ones land)", () => {
    expect(newer.length).toBeGreaterThanOrEqual(4);
    expect(newer).toContain("20261016090100_morocco_time_deadline_text.sql");
  });

  for (const file of newer) {
    test(`${file}`, () => {
      const sql = withoutComments(read(`supabase/migrations/${file}`));
      const offending = sql
        .split("\n")
        .map((line, index) => ({ line, number: index + 1 }))
        .filter(({ line }) => ZONE.test(line) && !ALLOWED_LINE.test(line))
        .map(({ line, number }) => `${number}: ${line.trim()}`);
      expect(offending).toEqual([]);
      // Nor the old local_zone variable, nor a conversion by a zone read from a variable that is
      // the Moroccan one: those are the shapes the old code took.
      expect(sql).not.toMatch(/\blocal_zone\b/);
    });
  }

  test("the guard works: the pre-helpers migrations are exactly where the literal lives", () => {
    const older = readdirSync(join(root, "supabase/migrations"))
      .filter((file) => file.endsWith(".sql") && file.split("_")[0]! < HELPER_VERSION)
      .filter((file) => ZONE.test(withoutComments(read(`supabase/migrations/${file}`))));
    expect(older.length).toBeGreaterThan(5);
  });
});
