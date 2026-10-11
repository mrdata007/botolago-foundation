import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The owner script that adds players only SofaScore knows. It must stay a
 * rehearsal unless edited on purpose, check everything before its first write,
 * write what api.admin_resolve_sofascore_player_match writes, and leave the
 * Fantasy pool alone.
 */

const root = join(import.meta.dir, "../..");
const script = readFileSync(join(root, "scripts/backend/add-sofascore-only-players.sql"), "utf8");
const lines = script.split("\n").map((line) => line.trim());
const code = script
  .split("\n")
  .filter((line) => !line.trim().startsWith("--"))
  .join("\n");
const idx = (needle: string) => {
  const at = code.indexOf(needle);
  expect(at).toBeGreaterThan(-1);
  return at;
};

describe("add-sofascore-only-players.sql", () => {
  test("ships as a rehearsal", () => {
    // Two transactions: the settings one (committed) and the work one (rolled back).
    expect(lines.filter((line) => line === "begin;")).toHaveLength(2);
    expect(lines.filter((line) => line === "commit;")).toHaveLength(1);
    expect(lines.filter((line) => line === "rollback;")).toHaveLength(1);
    expect(idx("rollback;")).toBeGreaterThan(idx("$work$;"));
  });

  test("lists the five players with their clubs and shirts, no invented ids", () => {
    for (const [name, club, shirt] of [
      ["Ismail Soubai", "CR Khemis Zemamra", 5],
      ["Rabiae Bounnit", "Widad Témara", 99],
      ["Saad Kouk", "UTS Rabat", 40],
      ["Souleymane Sy", "RSB Berkane", 37],
      ["Tumisang Orebonye", "Hassania Agadir", 28],
    ] as const)
      expect(script).toMatch(
        new RegExp(`"name": "${name}",\\s+"club": "${club}",\\s+"shirt": ${shirt},`),
      );
    expect(script).not.toMatch(/"sofascoreId": "[0-9]/);
  });

  test("refuses to run unfilled, unmigrated, with Pepites on or a job running", () => {
    expect(script).toContain("PASTE-OWNER-EMAIL");
    expect(code).toContain("'20261011190000'");
    expect(code).toContain("mode <> 'off'");
    expect(code).toContain("run.status not in ('succeeded', 'failed')");
    expect(idx("$preflight$;")).toBeLessThan(idx("insert into app.players"));
  });

  test("checks every guard before the player's first write", () => {
    const firstWrite = idx("insert into app.players");
    for (const guard of [
      "expected exactly one",
      "reason = 'no_candidate'",
      "resolved_at is null",
      "is not the current season",
      "already has a mapping",
      "already has a player named",
      "is already worn at that club",
      "no usable position",
      "pg_advisory_xact_lock",
    ])
      expect(idx(guard)).toBeLessThan(firstWrite);
  });

  test("writes what the staff resolve path writes", () => {
    expect(code).toContain("insert into app.team_memberships");
    expect(code).toContain("'sofascore-admin-resolve:' || v_log::text");
    expect(code).toContain("'staff-resolution'");
    expect(code).toContain("Chosen by staff from the SofaScore player review list.");
    expect(code).toContain("update app_private.sofascore_player_match_queue");
    expect(code).toContain("'staff_resolution'");
    expect(code).toContain("football_mapping_supporting_state(v_mapping)");
  });

  test("creates no Fantasy entries or prices and preserves other mappings", () => {
    expect(code).not.toMatch(/(insert into|delete from)\s+app\.fantasy_/);
    expect(code).toContain("update app.fantasy_players set football_team_id=v_team");
    expect(code).toContain("reviewed unused Fantasy catalog entry changed");
    expect(code).not.toMatch(/fantasy_initial_price|fantasy_player_price_history/);
    expect(code).not.toMatch(/(update|delete from)\s+app_private\.football_provider_mappings/);
    expect(code).not.toMatch(/(update|delete from)\s+app\.players/);
    expect(code).toContain("delete from app.team_memberships where id = v_obsolete");
    expect(code).toContain("obsolete membership evidence changed");
  });
});
