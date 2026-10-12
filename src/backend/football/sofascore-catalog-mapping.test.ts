import { describe, expect, test } from "bun:test";
import {
  mapClubs,
  mapPlayers,
  positionsCompatible,
  type CatalogClub,
  type CatalogPlayer,
  type MappedFixture,
  type Pos,
  type Side,
  type SofascoreLineupEntry,
  type SportsmonksLineupEntry,
} from "./sofascore-catalog-mapping";
import { buildReport, renderApplySql, renderMarkdown } from "./sofascore-catalog-mapping-output";

const T = (n: number) => `00000000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`;
const P = (n: number) => `00000000-0000-4000-9000-0000000000${String(n).padStart(2, "0")}`;

const club = (n: number, sm: string | null, existing: string | null = null): CatalogClub => ({
  internalId: T(n),
  sportsmonksId: sm,
  existingSofascoreId: existing,
});

const fx = (id: string, smH: string, smA: string, sH: string, sA: string): MappedFixture => ({
  fixtureId: id,
  smHomeTeamId: smH,
  smAwayTeamId: smA,
  sofaHomeTeamId: sH,
  sofaAwayTeamId: sA,
});

describe("clubs: side agreement across mapped fixtures", () => {
  test("pairs a SportsMonks team with the SofaScore team on the same side of two fixtures", () => {
    const r = mapClubs(
      [club(1, "10"), club(2, "20")],
      [fx("f1", "10", "20", "100", "200"), fx("f2", "20", "10", "200", "100")],
    );
    expect(r.proposed.map((p) => [p.sportsmonksId, p.sofascoreId, p.fixtures])).toEqual([
      ["10", "100", 2],
      ["20", "200", 2],
    ]);
    expect(r.unmapped).toEqual([]);
  });

  test("a team sitting with different SofaScore ids across fixtures is unmapped", () => {
    const r = mapClubs(
      [club(1, "10"), club(2, "20")],
      [fx("f1", "10", "20", "100", "200"), fx("f2", "10", "20", "999", "200")],
    );
    const u = r.unmapped.find((x) => x.internalId === T(1))!;
    expect(u.reason).toBe("conflicting_sofascore_teams");
    expect(u.bestEvidence).toContain("100x1");
    // The other club is fine: it agreed twice.
    expect(r.proposed.map((p) => p.sportsmonksId)).toEqual(["20"]);
  });

  test("one fixture is too little evidence, and a club without shared fixtures is reported", () => {
    const r = mapClubs(
      [club(1, "10"), club(2, "20"), club(3, "30"), club(4, null)],
      [fx("f1", "10", "20", "100", "200")],
    );
    expect(r.unmapped.map((u) => [u.internalId, u.reason])).toEqual([
      [T(1), "too_little_evidence"],
      [T(2), "too_little_evidence"],
      [T(3), "no_shared_fixtures"],
      [T(4), "no_sportsmonks_mapping"],
    ]);
  });

  test("one SofaScore id shared by two SportsMonks teams unmaps both", () => {
    const r = mapClubs(
      [club(1, "10"), club(2, "11")],
      [fx("f1", "10", "20", "100", "200"), fx("f2", "11", "20", "100", "200")],
    );
    expect(r.unmapped.map((u) => u.reason)).toEqual([
      "sofascore_team_claimed_by_other_club",
      "sofascore_team_claimed_by_other_club",
    ]);
  });

  test("an existing mapping that disagrees is a conflict, one that agrees is already mapped", () => {
    const fixtures = [fx("f1", "10", "20", "100", "200"), fx("f2", "10", "20", "100", "200")];
    const r = mapClubs([club(1, "10", "999"), club(2, "20", "200")], fixtures);
    expect(r.unmapped[0].reason).toBe("conflicts_with_existing_mapping");
    expect(r.proposed[0]).toMatchObject({ internalId: T(2), status: "already_mapped" });
  });
});

// ---------------------------------------------------------------------------

const resolved = new Map([
  [T(1), "100"],
  [T(2), "200"],
]);
const fixtures = [fx("f1", "10", "20", "100", "200"), fx("f2", "20", "10", "200", "100")];

const sm = (
  fixtureId: string,
  side: Side,
  player: number,
  shirt: number | null,
  position: Pos | null = "M",
): SportsmonksLineupEntry => ({
  fixtureId,
  side,
  internalTeamId:
    side === "home" ? (fixtureId === "f1" ? T(1) : T(2)) : fixtureId === "f1" ? T(2) : T(1),
  internalPlayerId: P(player),
  shirt,
  position,
});

const sofa = (
  fixtureId: string,
  side: Side,
  id: string,
  shirt: number | null,
  position: Pos | null = "M",
  displayName?: string,
): SofascoreLineupEntry => ({
  fixtureId,
  side,
  sofascorePlayerId: id,
  shirt,
  position,
  displayName,
});

const cat = (n: number, displayName?: string): CatalogPlayer => ({
  internalId: P(n),
  sportsmonksId: String(1000 + n),
  existingSofascoreId: null,
  displayName,
});

const run = (
  players: CatalogPlayer[],
  smLineups: SportsmonksLineupEntry[],
  sofaLineups: SofascoreLineupEntry[],
  owners = new Map<string, string>(),
) =>
  mapPlayers({
    players,
    fixtures,
    smLineups,
    sofaLineups,
    resolvedClubs: resolved,
    existingSofaOwners: owners,
  });

describe("players: side + shirt + position", () => {
  test("maps a player seen with the same side and shirt in two matches (multi_match)", () => {
    const r = run(
      [cat(1)],
      [sm("f1", "home", 1, 7), sm("f2", "away", 1, 7)],
      [sofa("f1", "home", "501", 7), sofa("f2", "away", "501", 7)],
    );
    expect(r.proposed).toHaveLength(1);
    expect(r.proposed[0]).toMatchObject({
      internalId: P(1),
      sofascoreId: "501",
      matches: 2,
      confidence: "multi_match",
      status: "new",
    });
  });

  test("one clean match is accepted as single_match", () => {
    const r = run([cat(1)], [sm("f1", "home", 1, 7)], [sofa("f1", "home", "501", 7)]);
    expect(r.proposed[0]).toMatchObject({ matches: 1, confidence: "single_match" });
  });

  test("same shirt on the other side is not a match", () => {
    const r = run([cat(1)], [sm("f1", "home", 1, 7)], [sofa("f1", "away", "501", 7)]);
    expect(r.proposed).toEqual([]);
    expect(r.unmapped[0].reason).toBe("no_shirt_or_position_agreement");
  });

  test("an incompatible position blocks, a neighbouring or missing one does not", () => {
    expect(positionsCompatible("G", "D")).toBe(false);
    expect(positionsCompatible("D", "F")).toBe(false);
    expect(positionsCompatible("D", "M")).toBe(true);
    expect(positionsCompatible(null, "G")).toBe(true);
    const bad = run([cat(1)], [sm("f1", "home", 1, 1, "G")], [sofa("f1", "home", "501", 1, "F")]);
    expect(bad.proposed).toEqual([]);
    const ok = run([cat(1)], [sm("f1", "home", 1, 8, "M")], [sofa("f1", "home", "501", 8, null)]);
    expect(ok.proposed).toHaveLength(1);
  });

  test("a player with no lineup is reported, not guessed", () => {
    const r = run([cat(1)], [], []);
    expect(r.unmapped[0].reason).toBe("no_lineup_evidence");
  });
});

describe("players: conflicts become unmapped with a reason", () => {
  test("a different SofaScore player at the same shirt in another match makes it ambiguous", () => {
    const r = run(
      [cat(1)],
      [sm("f1", "home", 1, 7), sm("f2", "away", 1, 7)],
      [sofa("f1", "home", "501", 7), sofa("f2", "away", "502", 7)],
    );
    expect(r.proposed).toEqual([]);
    expect(r.unmapped[0].reason).toBe("ambiguous_multiple_sofascore_candidates");
    expect(r.unmapped[0].bestEvidence).toContain("501x1");
  });

  test("two SportsMonks players claiming one SofaScore player are both unmapped", () => {
    const r = run(
      [cat(1), cat(2)],
      [sm("f1", "home", 1, 7), sm("f2", "away", 2, 9)],
      [sofa("f1", "home", "501", 7), sofa("f2", "away", "501", 9)],
    );
    expect(r.proposed).toEqual([]);
    expect(r.unmapped.map((u) => u.reason)).toEqual([
      "sofascore_player_claimed_by_multiple",
      "sofascore_player_claimed_by_multiple",
    ]);
  });

  test("both appear in a match but with different shirts: contradiction", () => {
    const r = run(
      [cat(1)],
      [sm("f1", "home", 1, 7), sm("f2", "away", 1, 7)],
      [sofa("f1", "home", "501", 7), sofa("f2", "away", "501", 11)],
    );
    expect(r.proposed).toEqual([]);
    expect(r.unmapped[0].reason).toBe("contradicted_in_match");
  });

  test("a repeated shirt on one side is undecidable", () => {
    const r = run(
      [cat(1), cat(2)],
      [sm("f1", "home", 1, 7), sm("f1", "home", 2, 7)],
      [sofa("f1", "home", "501", 7)],
    );
    expect(r.proposed).toEqual([]);
    expect(r.unmapped.map((u) => u.reason)).toEqual([
      "duplicate_shirt_in_lineup",
      "duplicate_shirt_in_lineup",
    ]);
  });

  test("the club of the lineup must be the mapped club of that side", () => {
    const wrong = mapPlayers({
      players: [cat(1)],
      fixtures,
      smLineups: [sm("f1", "home", 1, 7)],
      sofaLineups: [sofa("f1", "home", "501", 7)],
      resolvedClubs: new Map([[T(1), "555"]]),
      existingSofaOwners: new Map(),
    });
    expect(wrong.unmapped[0].reason).toBe("club_mismatch");
    const none = mapPlayers({
      players: [cat(1)],
      fixtures,
      smLineups: [sm("f1", "home", 1, 7)],
      sofaLineups: [sofa("f1", "home", "501", 7)],
      resolvedClubs: new Map(),
      existingSofaOwners: new Map(),
    });
    expect(none.unmapped[0].reason).toBe("club_unmapped");
  });

  test("a SofaScore id that already belongs to another player, or an existing mapping that differs", () => {
    const owned = run(
      [cat(1)],
      [sm("f1", "home", 1, 7)],
      [sofa("f1", "home", "501", 7)],
      new Map([["501", P(9)]]),
    );
    expect(owned.unmapped[0].reason).toBe("sofascore_id_mapped_to_other_player");
    const differs = run(
      [{ ...cat(1), existingSofascoreId: "509" }],
      [sm("f1", "home", 1, 7)],
      [sofa("f1", "home", "501", 7)],
    );
    expect(differs.unmapped[0].reason).toBe("conflicts_with_existing_mapping");
  });
});

describe("players: names never decide", () => {
  test("two players with identical names but different shirts and sides are not merged", () => {
    // Catalog player 1 and SofaScore player s2 carry the same name, but sit on
    // different sides with different shirts. The catalog player's real match is s1.
    const r = run(
      [cat(1, "Ahmed Alami"), cat(2, "Ahmed Alami")],
      [sm("f1", "home", 1, 7), sm("f1", "away", 2, 22)],
      [
        sofa("f1", "home", "501", 7, "M", "Mohamed X"),
        sofa("f1", "away", "502", 22, "M", "Ahmed Alami"),
      ],
    );
    const bySofa = new Map(r.proposed.map((p) => [p.internalId, p.sofascoreId]));
    expect(bySofa.get(P(1))).toBe("501");
    expect(bySofa.get(P(2))).toBe("502");
    // And a same-name pair that disagrees on shirt and side is never joined.
    const apart = run(
      [cat(1, "Ahmed Alami")],
      [sm("f1", "home", 1, 7)],
      [sofa("f1", "away", "502", 22, "M", "Ahmed Alami")],
    );
    expect(apart.proposed).toEqual([]);
    expect(apart.unmapped[0].reason).toBe("no_shirt_or_position_agreement");
  });

  test("a name difference does not block a match that agrees on side, shirt and position", () => {
    const r = run(
      [cat(1, "Youssef En-Nesyri")],
      [sm("f1", "home", 1, 19, "F"), sm("f2", "away", 1, 19, "F")],
      [
        sofa("f1", "home", "501", 19, "F", "Y. Ennesyri"),
        sofa("f2", "away", "501", 19, "F", "Totally Different Spelling"),
      ],
    );
    expect(r.proposed).toHaveLength(1);
    expect(r.proposed[0].sofascoreId).toBe("501");
  });
});

describe("report and apply script", () => {
  const clubs = mapClubs(
    [club(1, "10"), club(2, "20")],
    [fx("f1", "10", "20", "100", "200"), fx("f2", "20", "10", "200", "100")],
  );
  const players = run(
    [cat(1), cat(2)],
    [sm("f1", "home", 1, 7), sm("f2", "away", 1, 7), sm("f1", "away", 2, 9)],
    [sofa("f1", "home", "501", 7), sofa("f2", "away", "501", 7), sofa("f1", "away", "502", 9)],
  );
  const report = buildReport({
    generatedAt: "2026-10-13T00:00:00.000Z",
    namesShown: false,
    inputs: {
      fixturesMappedOnBothProviders: 2,
      fixturesWithBothLineups: 2,
      catalogClubs: 2,
      catalogPlayers: 2,
      existingSofascoreClubMappings: 0,
      existingSofascorePlayerMappings: 3,
      sofascoreRequests: 4,
    },
    clubs,
    players,
  });

  test("markdown has no name column unless names were shown", () => {
    expect(renderMarkdown(report)).not.toContain("| name");
    expect(renderMarkdown(report)).toContain("## Players: UNMAPPED");
  });

  test("the apply script rolls back by default and keeps single_match out unless asked", () => {
    const sql = renderApplySql(report, { includeSingleMatch: false });
    expect(sql).toContain("c_commit constant boolean := false;");
    expect(sql).toContain("c_one_writer_checked constant boolean := false;");
    expect(sql).toContain("DRY_RUN_ROLLBACK");
    expect(sql).toContain(P(1)); // multi_match
    expect(sql).not.toContain(P(2)); // single_match
    expect(renderApplySql(report, { includeSingleMatch: true })).toContain(P(2));
    expect(sql).toContain("c_expected_sofa_player_mappings constant integer := 3;");
  });

  test("the apply script refuses ids that are not plain uuids and digits", () => {
    const bad = {
      ...report,
      players: {
        ...report.players,
        proposed: [{ ...report.players.proposed[0], sofascoreId: "1'; drop table x; --" }],
      },
    };
    expect(() => renderApplySql(bad, { includeSingleMatch: true })).toThrow(
      /catalog_sql_invalid_id/,
    );
  });
});
