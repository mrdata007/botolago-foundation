import { describe, expect, test } from "bun:test";
import {
  buildReport,
  classifySquads,
  positionsCompatible,
  renderApplySql,
  renderMarkdown,
  type CatalogMember,
  type SquadEntry,
} from "./sofascore-squad-link";

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const TEAM = U(900);
const CLUBS = [{ internalTeamId: TEAM, sofascoreTeamId: "7001" }];
const entry = (id: string, shirt: number | null, position: SquadEntry["position"], name?: string) =>
  ({
    sofascoreTeamId: "7001",
    sofascorePlayerId: id,
    shirt,
    position,
    displayName: name ?? null,
  }) satisfies SquadEntry;
const member = (
  n: number,
  shirt: number | null,
  position: CatalogMember["position"],
  mapping: CatalogMember["mapping"] = "none",
  name?: string,
): CatalogMember => ({
  playerId: U(n),
  teamId: TEAM,
  shirt,
  position,
  mapping,
  displayName: name ?? null,
});
const run = (squads: SquadEntry[], members: CatalogMember[], mapped: string[] = []) =>
  classifySquads({ clubs: CLUBS, squads, members, mappedSofascoreIds: new Set(mapped) });

describe("positionsCompatible", () => {
  test("equal, neighbouring lines and unknown; a goalkeeper only with a goalkeeper", () => {
    expect(positionsCompatible("D", "D")).toBe(true);
    expect(positionsCompatible("D", "M")).toBe(true);
    expect(positionsCompatible("M", "F")).toBe(true);
    expect(positionsCompatible(null, "G")).toBe(true);
    expect(positionsCompatible("G", "G")).toBe(true);
    expect(positionsCompatible("G", "D")).toBe(false);
    expect(positionsCompatible("D", "F")).toBe(false);
  });
});

describe("classifySquads", () => {
  test("exactly one candidate both ways is CONFIRMED, whatever the names say", () => {
    const r = run(
      [entry("11", 7, "F", "Completely Different Spelling")],
      [member(1, 7, "F", "none", "Nobody Alike")],
    );
    expect(r.confirmed).toHaveLength(1);
    expect(r.confirmed[0]).toMatchObject({ sofascorePlayerId: "11", playerId: U(1), shirt: 7 });
    expect(r.suggestions).toHaveLength(0);
    expect(r.counts.linkedAutomatically).toBe(1);
  });

  test("the same name with a different shirt is never linked", () => {
    const r = run([entry("11", 9, "F", "Same Name")], [member(1, 7, "F", "none", "Same Name")]);
    expect(r.confirmed).toHaveLength(0);
    expect(r.suggestions).toHaveLength(0);
    expect(r.unmatchedSquad[0]).toMatchObject({ sofascorePlayerId: "11", reason: "no_candidate" });
    expect(r.unmatchedCatalog[0]).toMatchObject({ playerId: U(1), reason: "no_squad_entry" });
  });

  test("a neighbouring position is still confirmed; a goalkeeper against an outfield player is not", () => {
    const ok = run([entry("11", 8, "M")], [member(1, 8, "D")]);
    expect(ok.confirmed).toHaveLength(1);
    const gk = run([entry("12", 1, "G")], [member(2, 1, "D")]);
    expect(gk.confirmed).toHaveLength(0);
    expect(gk.suggestions).toHaveLength(0);
    expect(gk.unmatchedSquad[0]?.reason).toBe("position_mismatch");
  });

  test("an unknown position is a suggestion, not a confirmation", () => {
    const r = run([entry("11", 7, null)], [member(1, 7, "F")]);
    expect(r.confirmed).toHaveLength(0);
    expect(r.suggestions[0]).toMatchObject({ reason: "weak_match", candidatePlayerIds: [U(1)] });
    expect(r.counts.needReview).toBe(1);
  });

  test("two squad players claiming one catalog player are both suggestions", () => {
    const r = run([entry("11", 7, "F"), entry("12", 7, "M")], [member(1, 7, "F")]);
    expect(r.confirmed).toHaveLength(0);
    expect(r.suggestions.map((s) => s.reason)).toEqual(["ambiguous_shirt", "ambiguous_shirt"]);
  });

  test("two catalog players with one shirt are an ambiguous suggestion with both offered", () => {
    const r = run([entry("11", 7, "F")], [member(1, 7, "F"), member(2, 7, "M")]);
    expect(r.confirmed).toHaveLength(0);
    expect(r.suggestions[0]).toMatchObject({ reason: "ambiguous_shirt" });
    expect(r.suggestions[0]!.candidatePlayerIds).toEqual([U(1), U(2)]);
  });

  test("a catalog member with no shirt on file is a suggestion, a squad player with no shirt is unmatched", () => {
    const a = run([entry("11", 7, "F")], [member(1, null, "F")]);
    expect(a.suggestions[0]).toMatchObject({
      reason: "no_shirt_on_file",
      candidatePlayerIds: [U(1)],
    });
    const b = run([entry("12", null, "F")], [member(2, 9, "F")]);
    expect(b.unmatchedSquad[0]?.reason).toBe("no_shirt");
  });

  test("too many members with no shirt are not all offered", () => {
    const r = run(
      [entry("11", 7, "F")],
      [member(1, null, "F"), member(2, null, "F"), member(3, null, "F"), member(4, null, "F")],
    );
    expect(r.suggestions).toHaveLength(0);
    expect(r.unmatchedSquad[0]?.reason).toBe("no_candidate");
    expect(r.unmatchedCatalog).toHaveLength(4);
  });

  test("players already linked are left alone and counted", () => {
    const r = run(
      [entry("11", 7, "F"), entry("12", 8, "F")],
      [member(1, 7, "F", "active"), member(2, 8, "F")],
      ["11"],
    );
    expect(r.counts.alreadyMapped).toBe(1);
    expect(r.confirmed.map((c) => c.sofascorePlayerId)).toEqual(["12"]);
    expect(r.unmatchedCatalog).toHaveLength(0);
  });

  test("a catalog player with an inactive mapping is never confirmed", () => {
    const r = run([entry("11", 7, "F")], [member(1, 7, "F", "inactive")]);
    expect(r.confirmed).toHaveLength(0);
    expect(r.unmatchedSquad[0]?.reason).toBe("inactive_mapping_exists");
    expect(r.unmatchedCatalog[0]?.reason).toBe("inactive_mapping_exists");
  });

  test("counts add up over a whole club", () => {
    const r = run(
      [
        entry("1", 1, "G"),
        entry("2", 2, "D"),
        entry("3", 3, null),
        entry("4", 4, "F"),
        entry("5", 5, "M"),
      ],
      [
        member(1, 1, "G"),
        member(2, 2, "D"),
        member(3, 3, "M"),
        member(4, 40, "F"),
        member(6, 6, "M"),
      ],
    );
    expect(r.counts).toMatchObject({
      squadPlayers: 5,
      confirmed: 2,
      suggestions: 1,
      unmatchedSquad: 2,
      unmatchedCatalog: 2,
      linkedAutomatically: 2,
      needReview: 1,
    });
  });

  test("a club with no squad is counted", () => {
    const r = classifySquads({
      clubs: [...CLUBS, { internalTeamId: U(901), sofascoreTeamId: "7002" }],
      squads: [entry("1", 1, "G")],
      members: [member(1, 1, "G")],
      mappedSofascoreIds: new Set(),
    });
    expect(r.counts.clubsWithoutSquad).toBe(1);
  });
});

describe("report and apply script", () => {
  const result = run(
    [entry("11", 7, "F", "It's A Name"), entry("12", 9, null)],
    [member(1, 7, "F"), member(2, 9, "F")],
  );
  const report = (names: boolean) =>
    buildReport({
      generatedAt: "2026-10-13T00:00:00Z",
      namesShown: names,
      existingSofascorePlayerMappings: 42,
      sofascoreRequests: 16,
      failedSquads: [],
      result,
    });

  test("the summary prints the counts and hides names by default", () => {
    const text = renderMarkdown(report(false));
    expect(text).toContain("Linked automatically once applied (CONFIRMED): 1");
    expect(text).toContain("Need review (SUGGESTIONS, one click each): 1");
    expect(text).toContain("Names in this report: not shown");
    expect(text).not.toContain("| name |");
  });

  test("the apply script is guarded, dry by default, and writes staff-resolution provenance", () => {
    const sql = renderApplySql(report(false), { ownerAuthUserId: U(5) });
    expect(sql).toContain("c_commit constant boolean := false;");
    expect(sql).toContain("c_one_writer_checked constant boolean := false;");
    expect(sql).toContain("DRY_RUN_ROLLBACK");
    expect(sql).toContain("'staff-resolution'");
    expect(sql).toContain("'sofascore-admin-resolve:' || v_log::text");
    expect(sql).toContain(
      "pg_advisory_xact_lock(hashtextextended('sofascore-player-auto-map', 0))",
    );
    expect(sql).toContain("sofascore_fantasy_reopen");
    expect(sql).toContain("sofascore_player_match_enqueue");
    expect(sql).toContain("c_expected_sofa_player_mappings constant integer := 42;");
    expect(sql).toContain(report(false).proposalDigest);
    // Without --show-names no name reaches the script: a placeholder is queued instead.
    expect(sql).not.toContain("It's A Name");
    expect(sql).toContain("SofaScore player 12");
  });

  test("the apply script treats a second SofaScore id as linked (20261014170000)", () => {
    const sql = renderApplySql(report(false), { ownerAuthUserId: U(5) });
    expect(sql).toContain("GUARD: migration 20261014170000 (second SofaScore ids) is not applied");
    // A confirmed link is refused when either side is an alias; a suggestion for an alias is skipped.
    expect(sql).toContain("where a.sofascore_player_id = r.sofa_id or a.player_id = r.player_id");
    expect(sql).toContain(
      "or exists (select 1 from app_private.sofascore_player_aliases a where a.sofascore_player_id = r.sofa_id) then\n      v_skipped",
    );
  });

  test("a name that is shown is quoted safely", () => {
    const named = classifySquads({
      clubs: CLUBS,
      squads: [entry("12", 9, null, "O'Brien")],
      members: [member(2, 9, "F")],
      mappedSofascoreIds: new Set(),
    });
    const sql = renderApplySql(
      buildReport({
        generatedAt: "x",
        namesShown: true,
        existingSofascorePlayerMappings: 0,
        sofascoreRequests: 1,
        failedSquads: [],
        result: named,
      }),
    );
    expect(sql).toContain("O''Brien");
  });

  test("a malformed id is refused instead of written", () => {
    const bad = {
      ...result,
      confirmed: [{ ...result.confirmed[0]!, sofascorePlayerId: "1; drop table x" }],
    };
    expect(() => renderApplySql({ ...report(false), result: bad })).toThrow(
      /squad_link_sql_invalid_id/,
    );
  });
});
