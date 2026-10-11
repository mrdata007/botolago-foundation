import { describe, expect, test } from "bun:test";
import { providerFixture } from "../football/provider/performance-fixtures";
import {
  parseSofascoreDetail,
  parseSofascoreIncidents,
  parseSofascoreLineups,
  parseSofascoreStatistics,
} from "../football/provider/sofascore-adapter";
import { buildReviewedIdentitySnapshot, type MappingRowInput } from "./reviewed-identities";
import {
  prepareSofascoreObservation,
  type PrepareInput,
  type SofascoreMatchData,
} from "./sofascore-fantasy";

const uuid = (n: number) => `a0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const binding = { appFixtureId: uuid(1), homeTeamId: uuid(2), awayTeamId: uuid(3) };
const OBSERVED = "2026-10-11T12:00:00.000Z";

function load(id: string): SofascoreMatchData {
  const f = (name: string) => providerFixture("sofascore", `${id}.${name}`);
  return {
    summary: parseSofascoreDetail(f("detail")),
    lineups: parseSofascoreLineups(f("lineups")),
    incidents: parseSofascoreIncidents(f("incidents")),
    statistics: parseSofascoreStatistics(f("statistics")),
  };
}

/** Maps every player in the lineup except `skip` (sofascore ids). */
async function snapshotOf(match: SofascoreMatchData, skip: readonly string[] = []) {
  const rows: MappingRowInput[] = match.lineups.players
    .filter((p) => !skip.includes(p.externalId))
    .map((p, i) => ({
      mappingId: uuid(1000 + i),
      provider: "sofascore",
      externalId: p.externalId,
      appPlayerId: uuid(5000000 + Number(p.externalId)),
      active: true,
      reviewed: true,
      version: "test",
      updatedAt: OBSERVED,
    }));
  return buildReviewedIdentitySnapshot(rows, OBSERVED);
}

async function prepare(
  match: SofascoreMatchData,
  extra: Partial<PrepareInput> = {},
  skip: string[] = [],
) {
  return prepareSofascoreObservation({
    observedAt: OBSERVED,
    match,
    snapshot: await snapshotOf(match, skip),
    binding,
    ...extra,
  });
}

const withStats = (
  match: SofascoreMatchData,
  id: string,
  patch: Record<string, number | null>,
): SofascoreMatchData => ({
  ...match,
  lineups: {
    ...match.lineups,
    players: match.lineups.players.map((pl) =>
      pl.externalId === id ? { ...pl, stats: { ...pl.stats!, ...patch } } : pl,
    ),
  },
});

describe("SofaScore-only Fantasy observation", () => {
  test("full-coverage match (17132481) reaches full mode with every field a fact", async () => {
    const match = load("17132481");
    const p = await prepare(match);
    expect(p.blockers).toEqual([]);
    expect(p.coverage).toBe("full");
    expect(p.request).not.toBeNull();
    expect(p.requestDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(p.unmapped).toEqual([]);
    expect(p.expectedMode).toBe("full");
    const rows = p.request!.payload.players;
    expect(rows.length).toBeGreaterThanOrEqual(22);
    for (const row of rows) {
      for (const e of Object.values(row.evidence)) {
        expect(e.source).toBe("sofascore");
        expect(["verified", "unknown"]).toContain(e.state);
      }
      expect(row.stats.minutes).toBeGreaterThan(0);
    }
    expect(JSON.stringify(p.request).toLowerCase()).not.toContain("flashscore");
  });

  test("goals come from incidents (penalty included), not lineup statistics", async () => {
    const match = load("17132481");
    const p = await prepare(match);
    const rows = p.request!.payload.players;
    expect(rows.reduce((n, r) => n + (r.stats.goals as number), 0)).toBe(3);
    for (const i of match.incidents.filter((x) => x.kind === "goal" || x.kind === "penalty_goal")) {
      const row = rows.find((r) => r.identity.sofascoreId === i.player!.externalId);
      expect(row?.stats.goals).toBe(1);
    }
  });

  test("goals the lineup statistics miss still count", async () => {
    const match = load("17132481");
    const zeroed: SofascoreMatchData = {
      ...match,
      lineups: {
        ...match.lineups,
        players: match.lineups.players.map((pl) =>
          pl.stats ? { ...pl, stats: { ...pl.stats, goals: 0 } } : pl,
        ),
      },
    };
    const p = await prepare(zeroed);
    expect(p.request!.payload.players.reduce((n, r) => n + (r.stats.goals as number), 0)).toBe(3);
  });

  test("limited-coverage match (16958239): detail fields are unknown, never zero", async () => {
    const match = load("16958239");
    const p = await prepare(match);
    expect(p.blockers).toEqual([]);
    expect(p.coverage).toBe("limited");
    expect(p.expectedMode).toBe("simple");
    expect(p.request!.coverage).toBe("limited");
    for (const row of p.request!.payload.players) {
      expect(row.stats).not.toHaveProperty("saves");
      expect(row.stats).not.toHaveProperty("penaltiesSaved");
      expect(row.stats).not.toHaveProperty("penaltiesMissed");
      expect(row.stats).not.toHaveProperty("assists");
      expect(row.evidence.assists?.state).toBe("unknown");
      expect(row.evidence.penaltiesMissed?.state).toBe("unknown");
    }
    expect(p.unknownFields.assists).toBe(p.rows);
  });

  test("on full coverage a keeper's saves are SofaScore's own count; outfield players carry no keeper fields", async () => {
    const full = await prepare(load("17132481"));
    const keepers = full.request!.payload.players.filter((r) => "saves" in r.stats);
    expect(keepers.length).toBeGreaterThan(0);
    for (const k of keepers) expect(k.evidence.saves?.state).toBe("verified");
    for (const r of full.request!.payload.players)
      if (!("saves" in r.stats)) expect(r.evidence.saves?.state ?? "none").not.toBe("verified");
  });

  test("the M8 switch off omits every detail field and the fixture is simple", async () => {
    const p = await prepare(load("17132481"), { detailFields: false });
    expect(p.expectedMode).toBe("simple");
    for (const row of p.request!.payload.players) {
      expect(row.evidence.assists).toBeUndefined();
      expect(row.evidence.saves).toBeUndefined();
    }
  });

  test("a lineup assist that no incident names makes that assist unknown (the sources disagree)", async () => {
    const match = load("17132481");
    const other = match.lineups.players.find((pl) => pl.stats && pl.starter)!;
    const p = await prepare(withStats(match, other.externalId, { assists: 1 }));
    const row = p.request!.payload.players.find(
      (r) => r.identity.sofascoreId === other.externalId,
    )!;
    expect(row.evidence.assists?.state).toBe("unknown");
    expect(p.expectedMode).toBe("simple");
  });

  test("a keeper's saves are unknown when saves + conceded does not equal shots on target faced", async () => {
    const match = load("17132481");
    const statistics = match.statistics.map((l) =>
      l.period === "ALL" && l.key === "shotsOnGoal" ? { ...l, home: 99, away: 99 } : l,
    );
    const p = await prepare({ ...match, statistics });
    const keeperRows = p.request!.payload.players.filter((r) => r.evidence.saves !== undefined);
    expect(keeperRows.length).toBeGreaterThan(0);
    for (const r of keeperRows) expect(r.evidence.saves?.state).toBe("unknown");
    expect(p.expectedMode).toBe("simple");
  });

  test("an appearing player with no reviewed mapping holds the match back and lands on the worklist", async () => {
    const match = load("17132481");
    const starter = match.lineups.players.find((pl) => pl.starter && pl.side === "home")!;
    const sub = match.incidents.find((i) => i.kind === "substitution")!.playerIn!.externalId!;
    const p = await prepare(match, {}, [starter.externalId, sub]);
    expect(p.request).toBeNull();
    expect(p.blockers.map((b) => b.code)).toContain("unmapped_players");
    expect(p.unmapped.map((u) => u.sofascoreId).sort()).toEqual([starter.externalId, sub].sort());
    const entry = p.unmapped.find((u) => u.sofascoreId === starter.externalId)!;
    expect(entry.shirtNumber).toBe(starter.shirtNumber);
    expect(JSON.stringify(p.unmapped)).not.toContain(starter.name);
  });

  test("an unmapped bench player who never played does not hold the match back", async () => {
    const match = load("17132481");
    const came = new Set(
      match.incidents.filter((i) => i.kind === "substitution").map((i) => i.playerIn!.externalId!),
    );
    const bench = match.lineups.players.find((pl) => !pl.starter && !came.has(pl.externalId))!;
    const p = await prepare(match, {}, [bench.externalId]);
    expect(p.blockers).toEqual([]);
    expect(
      p.request!.payload.players.some((r) => r.identity.sofascoreId === bench.externalId),
    ).toBe(false);
  });

  test("minutes follow the substitution times within the documented tolerance", async () => {
    const match = load("17132481");
    const off = match.incidents.find((i) => i.kind === "substitution" && i.minute < 80)!.playerOut!
      .externalId!;
    const base = await prepare(match);
    const baseMinutes = base.request!.payload.players.find((r) => r.identity.sofascoreId === off)!
      .stats.minutes as number;
    expect(
      (await prepare(withStats(match, off, { minutesPlayed: baseMinutes + 6 }))).blockers,
    ).toEqual([]);
    expect(
      (await prepare(withStats(match, off, { minutesPlayed: baseMinutes - 2 }))).blockers,
    ).toEqual([]);
    const over = await prepare(withStats(match, off, { minutesPlayed: baseMinutes + 7 }));
    expect(over.blockers.map((b) => b.code)).toContain("minutes_mismatch");
    expect(over.request).toBeNull();
    const under = await prepare(withStats(match, off, { minutesPlayed: baseMinutes - 3 }));
    expect(under.blockers.map((b) => b.code)).toContain("minutes_mismatch");
  });

  test("goal incidents that do not add up to the score hold the match back", async () => {
    const match = load("17132481");
    const p = await prepare({
      ...match,
      incidents: match.incidents.filter((i) => !(i.kind === "goal" && i.minute === 48)),
    });
    expect(p.blockers.map((b) => b.code)).toContain("goals_do_not_add_up");
    expect(p.request).toBeNull();
  });

  test("an own goal (unknown label) and a second yellow are held for review", async () => {
    const match = load("17132481");
    const own = {
      ...match.incidents[1]!,
      kind: "unknown" as const,
      rawType: "goal",
      rawClass: "ownGoal",
    };
    const p = await prepare({ ...match, incidents: [...match.incidents, own] });
    expect(p.blockers.map((b) => b.code)).toContain("unknown_incident");
    const yellow = match.incidents.find((i) => i.kind === "yellow_card")!;
    const q = await prepare({
      ...match,
      incidents: [...match.incidents, { ...yellow, kind: "second_yellow" as const }],
    });
    expect(q.blockers.map((b) => b.code)).toContain("second_yellow_review");
  });

  test("an unfinished match and a bad binding produce no request", async () => {
    const match = load("17132481");
    const p = await prepare({ ...match, summary: { ...match.summary, finished: false } });
    expect(p.blockers.map((b) => b.code)).toContain("match_not_finished");
    const q = await prepareSofascoreObservation({
      observedAt: OBSERVED,
      match,
      snapshot: await snapshotOf(match),
      binding: { ...binding, awayTeamId: binding.homeTeamId },
    });
    expect(q.blockers.map((b) => b.code)).toContain("binding_invalid");
  });

  test("the same facts give the same digest", async () => {
    const a = await prepare(load("17132481"));
    const b = await prepare(load("17132481"));
    expect(a.requestDigest).toBe(b.requestDigest);
  });
});
