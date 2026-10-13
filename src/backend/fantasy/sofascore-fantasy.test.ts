import { describe, expect, test } from "bun:test";
import { providerFixture } from "../football/provider/performance-fixtures";
import {
  SofascoreParseError,
  parseSofascoreIncidentsDetailed,
  parseSofascoreLineupsDetailed,
} from "../../../supabase/functions/_shared/sofascore-performance-parse";
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
    // 895127 started and scored a penalty: an unmapped scorer can never be left out.
    const starter = match.lineups.players.find((pl) => pl.externalId === "895127")!;
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
    // Inside the tolerance the substitution times decide the minutes.
    expect(
      (await prepare(withStats(match, off, { minutesPlayed: baseMinutes + 6 })))
        .minutesFromSofascore,
    ).toBe(0);
    // Outside it (owner decision 2026-10-13) SofaScore's minutesPlayed is final: the
    // match is recorded with those minutes, never held, and the case is counted.
    const minutesOf = (p: Awaited<ReturnType<typeof prepare>>) =>
      p.request!.payload.players.find((r) => r.identity.sofascoreId === off)!.stats.minutes;
    const over = await prepare(withStats(match, off, { minutesPlayed: baseMinutes + 7 }));
    expect(over.blockers).toEqual([]);
    expect(over.minutesFromSofascore).toBe(1);
    expect(minutesOf(over)).toBe(Math.min(baseMinutes + 7, 90));
    const under = await prepare(withStats(match, off, { minutesPlayed: baseMinutes - 3 }));
    expect(under.blockers).toEqual([]);
    expect(under.minutesFromSofascore).toBe(1);
    expect(minutesOf(under)).toBe(baseMinutes - 3);
  });

  test("SofaScore minutes over 90 are capped, and the clean sheet follows the minutes used", async () => {
    const match = load("17132481");
    const off = match.incidents.find((i) => i.kind === "substitution" && i.minute < 80)!.playerOut!
      .externalId!;
    const long = await prepare(withStats(match, off, { minutesPlayed: 120 }));
    const row = long.request!.payload.players.find((r) => r.identity.sofascoreId === off)!;
    expect(row.stats.minutes).toBe(90);
    const short = await prepare(withStats(match, off, { minutesPlayed: 30 }));
    const shortRow = short.request!.payload.players.find((r) => r.identity.sofascoreId === off)!;
    expect(shortRow.stats.minutes).toBe(30);
    expect(shortRow.stats.cleanSheet).toBe(false);
  });

  test("a player on the pitch at half time may be over by the first half's stoppage time plus 2", async () => {
    const match = load("17132481");
    // A starter replaced in the second half: he played through the first half's stoppage time.
    const sub = match.incidents.find(
      (i) => i.kind === "substitution" && i.minute > 45 && i.minute < 80,
    )!;
    const off = sub.playerOut!.externalId!;
    const base = await prepare(match);
    const minutes = base.request!.payload.players.find((r) => r.identity.sofascoreId === off)!.stats
      .minutes as number;
    const announced = (firstHalf: number | null) => ({
      ...withStats(match, off, { minutesPlayed: minutes + 7 }),
      stoppage: { firstHalf, secondHalf: null },
    });
    // The tolerance decides whether the substitution times or SofaScore's
    // minutesPlayed give the minutes; the match is recorded either way.
    const fromSofascore = async (m: SofascoreMatchData) => {
      const p = await prepare(m);
      expect(p.blockers).toEqual([]);
      return p.minutesFromSofascore;
    };
    // Seven over: outside with no stoppage known, or with 4 announced (limit stays 6) ...
    expect(await fromSofascore(announced(null))).toBe(1);
    expect(await fromSofascore(announced(4))).toBe(1);
    // ... inside with 5 announced (limit 7), and 8 over is outside again then.
    expect(await fromSofascore(announced(5))).toBe(0);
    const eight = {
      ...withStats(match, off, { minutesPlayed: minutes + 8 }),
      stoppage: { firstHalf: 5, secondHalf: null },
    };
    expect(await fromSofascore(eight)).toBe(1);
    // A first-half incident at 45+6 proves at least six minutes were played: limit 8.
    const card = match.incidents.find((i) => i.kind === "yellow_card")!;
    const late = {
      ...withStats(match, off, { minutesPlayed: minutes + 8 }),
      incidents: [...match.incidents, { ...card, minute: 45, addedMinutes: 6 }],
    };
    expect(await fromSofascore(late)).toBe(0);
    // Period markers carry 999 added minutes: never read as stoppage time.
    const marker = {
      ...withStats(match, off, { minutesPlayed: minutes + 7 }),
      incidents: [...match.incidents, { ...card, minute: 45, addedMinutes: 999 }],
    };
    expect(await fromSofascore(marker)).toBe(1);
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

  test("an unknown score-relevant label still holds the match, an own goal that names no player too", async () => {
    // Changed from "an own goal (unknown label) and a second yellow are held for review":
    // a second yellow and an own goal NAMING a player are scored now (see the C1 tests
    // below); what stays a hold is a label nobody has seen, and an own goal with no player.
    const match = load("17132481");
    const strange = {
      ...match.incidents[1]!,
      kind: "unknown" as const,
      rawType: "goal",
      rawClass: "disallowedGoal",
    };
    const p = await prepare({ ...match, incidents: [...match.incidents, strange] });
    expect(p.blockers.map((b) => b.code)).toContain("unknown_incident");
    expect(p.request).toBeNull();
    const nobody = {
      ...match.incidents[1]!,
      kind: "unknown" as const,
      rawType: "goal",
      rawClass: "ownGoal",
      player: null,
    };
    const q = await prepare({ ...match, incidents: [...match.incidents, nobody] });
    expect(q.blockers.map((b) => b.code)).toEqual(["own_goal_unexplained"]);
    expect(q.request).toBeNull();
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

describe("unknown (unmapped, no candidate) substitutes", () => {
  // Fixture 17132481: home subs 1182110 (90', for the penalty scorer 895127) and 2161842 (86',
  // for 544156), away sub 2790119 (81', for 2776291); 1919299 came on at 46' and scored.
  const subHome = "2161842";
  const subHomeLate = "1182110";
  const subAway = "2790119";
  const rowOf = (p: Awaited<ReturnType<typeof prepare>>, id: string) =>
    p.request!.payload.players.find((r) => r.identity.sofascoreId === id);

  test("a substitute with no scoring trace is left out and listed, the request is otherwise complete", async () => {
    const match = load("17132481");
    const p = await prepare(match, {}, [subHome]);
    expect(p.blockers).toEqual([]);
    expect(p.request).not.toBeNull();
    expect(p.excludedUnmapped).toEqual([
      expect.objectContaining({ sofascoreId: subHome, reason: "no_candidate" }),
    ]);
    expect(p.unmapped.map((u) => u.sofascoreId)).toEqual([subHome]);
    const payload = p.request!.payload;
    expect(payload.excludedUnmappedPlayers).toEqual(p.excludedUnmapped);
    expect(payload.squadCompleteExceptExcluded).toBe(true);
    expect("squadComplete" in payload).toBe(false);
    expect(rowOf(p, subHome)).toBeUndefined();
    // Names never travel.
    expect(JSON.stringify(payload.excludedUnmappedPlayers)).not.toContain(
      match.lineups.players.find((pl) => pl.externalId === subHome)!.name,
    );
    // Eleven starters a side, as the recorder needs.
    for (const team of [binding.homeTeamId, binding.awayTeamId])
      expect(payload.players.filter((r) => r.teamId === team && r.started).length).toBe(11);
  });

  test("a request without exclusions is unchanged: squadComplete, no exclusion keys", async () => {
    const p = await prepare(load("17132481"));
    const payload = p.request!.payload as unknown as Record<string, unknown>;
    expect(payload.squadComplete).toBe(true);
    expect("squadCompleteExceptExcluded" in payload).toBe(false);
    expect("excludedUnmappedPlayers" in payload).toBe(false);
    expect(p.excludedUnmapped).toEqual([]);
  });

  test("the player the unknown substitute replaced keeps his exact minutes, goals and cards", async () => {
    const match = load("17132481");
    const base = await prepare(match);
    // 1182110 replaced the penalty scorer 895127 at 90'; 2161842 replaced 544156 at 86'.
    const both = await prepare(match, {}, [subHomeLate, subHome, subAway]);
    expect(both.blockers).toEqual([]);
    expect(both.excludedUnmapped.map((e) => e.sofascoreId).sort()).toEqual(
      [subHome, subHomeLate, subAway].sort(),
    );
    for (const off of ["895127", "544156", "2776291"]) {
      const a = rowOf(base, off)!;
      const b = rowOf(both, off)!;
      expect(b.stats).toEqual(a.stats);
      const states = (r: typeof a) =>
        Object.fromEntries(Object.entries(r.evidence).map(([k, v]) => [k, v.state]));
      expect(states(b)).toEqual(states(a));
    }
    expect(rowOf(both, "895127")!.stats.minutes).toBe(90);
    expect(rowOf(both, "895127")!.stats.goals).toBe(1);
    // Everyone else is identical too.
    const others = (r: typeof both) =>
      r
        .request!.payload.players.filter(
          (x) => ![subHomeLate, subHome, subAway].includes(x.identity.sofascoreId),
        )
        .map((x) => [x.identity.sofascoreId, x.stats]);
    expect(others(both)).toEqual(others(base));
    expect(both.expectedMode).toBe(base.expectedMode);
  });

  test("one unknown substitute on each side, as in the held production match", async () => {
    const p = await prepare(load("17132481"), {}, [subHome, subAway]);
    expect(p.blockers).toEqual([]);
    expect(p.excludedUnmapped.map((e) => e.side).sort()).toEqual(["away", "home"]);
  });

  test("an unknown substitute who scored still holds the match", async () => {
    const p = await prepare(load("17132481"), {}, ["1919299"]);
    expect(p.excludedUnmapped).toEqual([]);
    expect(p.blockers.map((b) => b.code)).toContain("unmapped_players");
    expect(p.request).toBeNull();
  });

  test("an unknown substitute who is named assister or carded is left out: those only ever score for him", async () => {
    const match = load("17132481");
    const goal = match.incidents.find((i) => i.kind === "goal" && i.side === "home")!;
    const assisted: SofascoreMatchData = {
      ...match,
      incidents: match.incidents.map((i) =>
        i === goal ? { ...i, assist: { ...i.assist!, externalId: subHome } } : i,
      ),
    };
    const yellow = match.incidents.find((i) => i.kind === "yellow_card" && i.side === "home")!;
    const carded: SofascoreMatchData = {
      ...match,
      incidents: [
        ...match.incidents,
        { ...yellow, player: { ...yellow.player!, externalId: subHome } },
      ],
    };
    const red: SofascoreMatchData = {
      ...match,
      incidents: [
        ...match.incidents,
        {
          ...yellow,
          kind: "red_card" as const,
          player: { ...yellow.player!, externalId: subHome },
        },
      ],
    };
    for (const m of [assisted, carded, red, withStats(match, subHome, { assists: 1 })]) {
      const p = await prepare(m, {}, [subHome]);
      expect(p.blockers).toEqual([]);
      expect(p.excludedUnmapped.map((x) => x.sofascoreId)).toEqual([subHome]);
      expect(p.request!.payload.players.some((r) => r.identity.sofascoreId === subHome)).toBe(
        false,
      );
    }
  });

  test("an unknown substitute counted by SofaScore with a goal, an own goal or a missed penalty still holds the match", async () => {
    const match = load("17132481");
    for (const m of [
      withStats(match, subHome, { goals: 1 }),
      withStats(match, subHome, { ownGoals: 1 }),
      withStats(match, subHome, { penaltyMissed: 1 }),
    ]) {
      const p = await prepare(m, {}, [subHome]);
      expect(p.excludedUnmapped).toEqual([]);
      expect(p.blockers.map((b) => b.code)).toContain("unmapped_players");
      expect(p.request).toBeNull();
    }
  });

  test("an unknown starter with no goal is left out and counted as an anonymous starter of his club", async () => {
    const match = load("17132481");
    const homeStarters = match.lineups.players.filter((pl) => pl.starter && pl.side === "home");
    const awayStarter = match.lineups.players.find(
      (pl) => pl.starter && pl.side === "away" && pl.externalId !== "1939981",
    )!;
    const left = [homeStarters[0].externalId, homeStarters[1].externalId, awayStarter.externalId];
    const p = await prepare(match, {}, left);
    expect(p.blockers).toEqual([]);
    expect(p.excludedUnmapped.map((x) => x.sofascoreId).sort()).toEqual([...left].sort());
    expect(p.excludedUnmapped.every((x) => x.started === true)).toBe(true);
    const payload = p.request!.payload;
    expect(payload.anonymousStarters).toBe(3);
    expect(payload.anonymousByTeam).toEqual({ [binding.homeTeamId]: 2, [binding.awayTeamId]: 1 });
    expect(payload.squadCompleteExceptExcluded).toBe(true);
    // Eleven a side still add up: rows plus the anonymous ones.
    for (const [team, anon] of [
      [binding.homeTeamId, 2],
      [binding.awayTeamId, 1],
    ] as const)
      expect(payload.players.filter((r) => r.teamId === team && r.started).length + anon).toBe(11);
  });

  test("a substitute left out carries no `started` key, so an older database reads the request as before", async () => {
    const p = await prepare(load("17132481"), {}, [subHome]);
    expect(Object.keys(p.excludedUnmapped[0])).not.toContain("started");
    expect(p.request!.payload.anonymousStarters).toBe(0);
    expect(p.request!.payload.anonymousByTeam).toEqual({});
  });

  test("more than six unknown players in one match hold it (the database takes at most six)", async () => {
    const match = load("17132481");
    const came = new Set(
      match.incidents.filter((i) => i.kind === "substitution").map((i) => i.playerIn!.externalId!),
    );
    const scorers = new Set(
      match.incidents.flatMap((i) =>
        i.kind === "goal" || i.kind === "penalty_goal" ? [i.player?.externalId] : [],
      ),
    );
    const subs = match.lineups.players
      .filter((pl) => !pl.starter && came.has(pl.externalId) && !scorers.has(pl.externalId))
      .map((pl) => pl.externalId);
    const starters = (side: "home" | "away") =>
      match.lineups.players
        .filter((pl) => pl.starter && pl.side === side && !scorers.has(pl.externalId))
        .slice(0, 2)
        .map((pl) => pl.externalId);
    const ids = [...starters("home"), ...starters("away"), ...subs];
    expect(ids.length).toBeGreaterThan(6);
    const p = await prepare(match, {}, ids);
    expect(p.excludedUnmapped).toEqual([]);
    expect(p.blockers.map((b) => b.code)).toContain("unmapped_players");
    expect(p.request).toBeNull();
    // Six are still fine.
    const six = await prepare(match, {}, ids.slice(0, 6));
    expect(six.excludedUnmapped).toHaveLength(6);
    expect(six.blockers).toEqual([]);
  });

  test("three unknown starters on one side hold the match", async () => {
    const match = load("17132481");
    const ids = match.lineups.players
      .filter((pl) => pl.starter && pl.side === "home" && pl.externalId !== "895127")
      .slice(0, 3)
      .map((pl) => pl.externalId);
    const p = await prepare(match, {}, ids);
    expect(p.excludedUnmapped).toEqual([]);
    expect(p.blockers.map((b) => b.code)).toContain("unmapped_players");
    expect(p.request).toBeNull();
  });

  test("a goal by the unknown substitute cannot hide: the incident names him, so he is not left out", async () => {
    const match = load("17132481");
    const goal = match.incidents.find((i) => i.kind === "goal" && i.side === "home")!;
    const m: SofascoreMatchData = {
      ...match,
      incidents: match.incidents.map((i) =>
        i === goal ? { ...i, player: { ...i.player!, externalId: subHome } } : i,
      ),
    };
    const p = await prepare(m, {}, [subHome]);
    expect(p.request).toBeNull();
    expect(p.blockers.map((b) => b.code)).toContain("unmapped_players");
  });

  test("a replaced player whose exit the incidents do not carry gets SofaScore's minutes", async () => {
    const match = load("17132481");
    const m: SofascoreMatchData = {
      ...match,
      incidents: match.incidents.map((i) =>
        i.kind === "substitution" && i.playerIn?.externalId === "1213241"
          ? { ...i, playerOut: null }
          : i,
      ),
    };
    // 1213241 came on at 73' for 1894253, whose SofaScore minutes (73) no longer fit a
    // full match. SofaScore's minutes are final (owner decision 2026-10-13): recorded
    // with SofaScore's figure, and the case counted.
    const p = await prepare(m, {}, ["1213241"]);
    expect(p.blockers).toEqual([]);
    expect(p.minutesFromSofascore).toBe(1);
    const replaced = p.request!.payload.players.find((r) => r.identity.sofascoreId === "1894253")!;
    // SofaScore's own minutesPlayed for him, 76 (it counts stoppage time).
    expect(replaced.stats.minutes).toBe(76);
  });

  test("an unknown (unmapped) substitute with minutes but no substitution incident is left out like any other", async () => {
    // Changed from "is still unexplained" (a match-wide appearance_unexplained hold): his
    // participation is unknown, which only ever matters to him, and he is in nobody's team.
    const match = load("17132481");
    const m: SofascoreMatchData = {
      ...match,
      incidents: match.incidents.filter(
        (i) => !(i.kind === "substitution" && i.playerIn?.externalId === subHome),
      ),
    };
    const p = await prepare(withStats(m, subHome, { minutesPlayed: 4 }), {}, [subHome]);
    expect(p.blockers).toEqual([]);
    expect(p.excludedUnmapped.map((x) => x.sofascoreId)).toEqual([subHome]);
    expect(p.request).not.toBeNull();
  });

  test("goal incidents must still add up to the score when an unknown substitute is left out", async () => {
    const match = load("17132481");
    const p = await prepare(
      {
        ...match,
        incidents: match.incidents.filter((i) => !(i.kind === "goal" && i.minute === 48)),
      },
      {},
      [subHome],
    );
    expect(p.blockers.map((b) => b.code)).toContain("goals_do_not_add_up");
    expect(p.request).toBeNull();
  });

  test("the same facts give the same digest, and the exclusion is part of it", async () => {
    const match = load("17132481");
    const a = await prepare(match, {}, [subHome]);
    const b = await prepare(match, {}, [subHome]);
    expect(a.requestDigest).toBe(b.requestDigest);
    expect(a.requestDigest).not.toBe((await prepare(match)).requestDigest);
  });
});

// ---------------------------------------------------------------------------
// Contract C1 (docs/backend/FANTASY_PENDING_ITEMS.md): one local doubt makes one
// player's one field unknown; it never holds the match. The cases are the audit's
// builder reproductions (branch claude/fantasy-scoring-reliability-audit,
// repro/builder.repro.test.ts), now asserting the new behaviour.

type Prepared = Awaited<ReturnType<typeof prepare>>;
type Row = NonNullable<Prepared["request"]>["payload"]["players"][number];
const rowFor = (p: Prepared, id: string): Row =>
  p.request!.payload.players.find((r) => r.identity.sofascoreId === id)!;
const unknownOf = (r: Row) =>
  Object.entries(r.evidence)
    .filter(([, e]) => e.state === "unknown")
    .map(([k]) => k)
    .sort();
// An extra goal also breaks the keeper's saves identity (saves + goals conceded = shots on
// target faced), which makes his saves unknown for an old, unrelated reason: leave it out.
const scoredUnknown = (r: Row) => unknownOf(r).filter((f) => f !== "saves");
const unknownTotals = (p: Prepared) => {
  const { saves: _saves, ...rest } = p.unknownFields;
  return rest;
};
const everyoneElse = (p: Prepared, except: readonly string[]) =>
  p
    .request!.payload.players.filter((r) => !except.includes(r.identity.sofascoreId))
    .map((r) => [r.identity.sofascoreId, r.stats, unknownOf(r)]);
const ref = (externalId: string) => ({ externalId, name: "x" });

describe("C1: the digest of a match with none of the new situations is unchanged", () => {
  // Computed on the base commit (7e8e8ea, before this change) with the same snapshot,
  // binding and observation time as `prepare` above.
  const PINNED: Record<string, string> = {
    "16354496": "2cbb71dee9e1f1f13b5b1b052690439d8a5adc130efe194905b58b22c1bf9460",
    "16408824": "76c85116d2c7c8e02efe2ebc0c5b3c7ff58280fc2b5d4ea18b9f21bd6fd804e7",
    "16958239": "b5d820be9ee01513cd294322156905d15167ede6692363ef87eb28d10a7dc677",
    "17132480": "7f29d80cc6f5ee613445ce16e8e047c87341d2fa088cb95e5d04b4257700f9af",
    "17132481": "46531a70cae26d0faa2a980d5108e79ac030fe9dbf293c47e65ddc33b37e00c2",
    "17132482": "024d2a25253dfc19f16359b40f2ee67a141fb4924b9e17b3b622a4a6c81caafe",
  };
  for (const [id, digest] of Object.entries(PINNED))
    test(`fixture ${id} gives the byte-identical request`, async () => {
      const p = await prepare(load(id));
      expect(p.blockers).toEqual([]);
      expect(p.requestDigest).toBe(digest);
    });

  test("the new keys are in the request only when a new situation is present", async () => {
    const text = JSON.stringify((await prepare(load("17132481"))).request);
    expect(text).not.toContain("pendingItems");
    expect(text).not.toContain('"reason"');
    const p = await prepare(load("17132481"));
    expect(p.pendingItems).toBe(0);
    expect(p.unknownReasons).toEqual({});
    expect(p.diagnostics).toEqual([]);
  });

  test("identical inputs give identical digests, also with the new situations", async () => {
    const match = load("17132481");
    const second = match.incidents.find((i) => i.kind === "yellow_card")!;
    const m = {
      ...match,
      incidents: [...match.incidents, { ...second, kind: "second_yellow" as const }],
    };
    expect((await prepare(m)).requestDigest).toBe((await prepare(m)).requestDigest);
    expect((await prepare(m)).requestDigest).not.toBe(PINNED["17132481"]);
  });

  test("real matches that were held before now produce a request, with only the named fields unknown", async () => {
    // 16438990 (a second yellow and same-minute changes), 16958236 and 17132472 (same-minute
    // goals and changes) were timeline_unresolved or second_yellow_review holds.
    for (const id of ["16438990", "16958236", "17132472"]) {
      const p = await prepare(load(id));
      expect(p.blockers).toEqual([]);
      expect(p.request).not.toBeNull();
      expect(p.expectedMode).toBe("simple");
    }
    const p = await prepare(load("16438990"));
    expect(p.unknownReasons).toEqual({ timeline_same_moment: 3 });
    expect(p.unknownFields.goalsConceded).toBe(2);
    expect(p.unknownFields.cleanSheet).toBe(1); // the other is a sub under 60 minutes: false
  });
});

describe("C1: event order uses added minutes (audit: stoppage time, same-minute goal and change)", () => {
  const match = load("17132481");
  const awayGoal = match.incidents.find((i) => i.kind === "goal" && i.side === "away")!;

  test("an away goal on the minute of a home double substitution leaves only the four players changed then unknown", async () => {
    const base = await prepare(match);
    const incidents = match.incidents.map((i) => (i === awayGoal ? { ...i, minute: 77 } : i));
    const p = await prepare({ ...match, incidents });
    expect(p.blockers).toEqual([]);
    expect(p.request).not.toBeNull();
    // Home changes at 77: 919329 and 1096751 off, 1140935 and 1140961 on.
    const changed = ["919329", "1096751", "1140935", "1140961"];
    for (const id of changed) {
      const r = rowFor(p, id);
      const sub = id === "1140935" || id === "1140961"; // on at 77: 13 minutes
      // Off at 77 (60 or more): both unknown. On at 77 (under 60 in every version): no clean
      // sheet is certain, so it is verified false; only the goals conceded stay unknown.
      expect(unknownOf(r)).toEqual(sub ? ["goalsConceded"] : ["cleanSheet", "goalsConceded"]);
      expect(r.evidence.goalsConceded!.reason).toBe("timeline_same_moment");
      expect(r.stats).not.toHaveProperty("goalsConceded");
      if (sub) {
        expect(r.stats.cleanSheet).toBe(false);
        expect(r.evidence.cleanSheet!.state).toBe("verified");
        expect(r.evidence.cleanSheet!.reason).toBeUndefined();
      } else {
        expect(r.evidence.cleanSheet!.reason).toBe("timeline_same_moment");
        expect(r.stats).not.toHaveProperty("cleanSheet");
      }
      // Everything else about them still counts.
      expect(r.evidence.minutes!.state).toBe("verified");
      expect(r.evidence.minutes!.reason).toBeUndefined();
      expect(r.stats.minutes).toBe(rowFor(base, id).stats.minutes);
    }
    expect(p.unknownFields).toEqual({ cleanSheet: 2, goalsConceded: 4 });
    expect(p.unknownReasons).toEqual({ timeline_same_moment: 6 });
    expect(p.expectedMode).toBe("simple");
    // Nobody else is unknown.
    for (const r of p.request!.payload.players)
      if (!changed.includes(r.identity.sofascoreId)) expect(unknownOf(r)).toEqual([]);
  });

  test("a home change at 90+2 and an away goal at 90+5 are in order: nobody is unknown", async () => {
    const base = await prepare(match);
    const late = { ...awayGoal, minute: 90, addedMinutes: 5 };
    const p = await prepare({
      ...match,
      summary: { ...match.summary, awayScore: (match.summary.awayScore ?? 0) + 1 },
      incidents: [...match.incidents, late],
    });
    expect(p.blockers).toEqual([]);
    expect(unknownTotals(p)).toEqual({});
    // 1182110 came on at 90+2, before the goal; 895127 went off at 90+2, so it is not his.
    expect(rowFor(p, "1182110").stats.goalsConceded).toBe(1);
    expect(rowFor(p, "1182110").stats.cleanSheet).toBe(false);
    expect(rowFor(p, "895127").stats.goalsConceded).toBe(
      rowFor(base, "895127").stats.goalsConceded,
    );
    // A home player on the pitch to the end concedes it.
    expect(rowFor(p, "1140820").stats.goalsConceded).toBe(
      (rowFor(base, "1140820").stats.goalsConceded as number) + 1,
    );
  });

  test("the same numbers (90+2 and 90+2) are ambiguous: the two players changed then are unknown", async () => {
    const same = { ...awayGoal, minute: 90, addedMinutes: 2 };
    const p = await prepare({
      ...match,
      summary: { ...match.summary, awayScore: (match.summary.awayScore ?? 0) + 1 },
      incidents: [...match.incidents, same],
    });
    expect(p.blockers).toEqual([]);
    // 895127 went off at 90+2 after 90 minutes: both unknown. 1182110 came on then (1 minute):
    // no clean sheet is certain, only his goals conceded are unknown.
    expect(scoredUnknown(rowFor(p, "895127"))).toEqual(["cleanSheet", "goalsConceded"]);
    expect(scoredUnknown(rowFor(p, "1182110"))).toEqual(["goalsConceded"]);
    expect(rowFor(p, "1182110").stats.cleanSheet).toBe(false);
    expect(unknownTotals(p)).toEqual({ cleanSheet: 1, goalsConceded: 2 });
  });

  test("a change with no added time against a goal with added time on the same minute is not ordered by guessing", async () => {
    // The change at 46 has no added minutes; a goal at 46+3 may be before it (first-half
    // stoppage) or not. Stricter than (minute, added ?? 0), which would put it after.
    const goal = { ...awayGoal, minute: 46, addedMinutes: 3 };
    const p = await prepare({
      ...match,
      summary: { ...match.summary, awayScore: (match.summary.awayScore ?? 0) + 1 },
      incidents: [...match.incidents, goal],
    });
    expect(p.blockers).toEqual([]);
    expect(
      p
        .request!.payload.players.filter((r) => scoredUnknown(r).length > 0)
        .map((r) => r.identity.sofascoreId)
        .sort(),
    ).toEqual(["1919299", "2150417"]);
  });

  test("times that cannot be true still hold the match (a player leaves before he arrives)", async () => {
    // 1140935 came on at 77; a second incident takes him off at 70.
    const sub = match.incidents.find((i) => i.kind === "substitution")!;
    const broken = {
      ...sub,
      minute: 70,
      addedMinutes: null,
      playerIn: ref("1845576"),
      playerOut: ref("1140935"),
    };
    const p = await prepare({ ...match, incidents: [...match.incidents, broken] });
    expect(p.blockers.map((b) => b.code)).toContain("timeline_unresolved");
    expect(p.request).toBeNull();
  });
});

describe("C1: minutes, two versions (audit: minutesPlayed against the substitution timeline)", () => {
  const match = load("17132481");

  test("a player subbed off at 46 with minutesPlayed 70: the lower minutes, the appearance pending, the clean sheet not wrongly certified", async () => {
    const off = "2150417"; // home, replaced at 46; away scored at 48
    const base = await prepare(match);
    const p = await prepare(withStats(match, off, { minutesPlayed: 70 }));
    expect(p.blockers).toEqual([]);
    const r = rowFor(p, off);
    expect(r.stats.minutes).toBe(46);
    expect(r.evidence.minutes!.state).toBe("verified");
    expect(r.pendingItems).toEqual([{ category: "appearance", reason: "minutes_conflict" }]);
    // Under both versions he did not keep a clean sheet (46 minutes; 70 minutes with a goal at
    // 48), so that is certified. The goals conceded differ between the two windows: unknown.
    expect(r.stats.cleanSheet).toBe(false);
    expect(r.evidence.cleanSheet!.state).toBe("verified");
    expect(unknownOf(r)).toEqual(["goalsConceded"]);
    expect(r.evidence.goalsConceded!.reason).toBe("minutes_conflict");
    expect(p.pendingItems).toBe(1);
    expect(p.minutesFromSofascore).toBe(0); // the lower figure is the timeline's
    expect(p.expectedMode).toBe("simple");
    expect(everyoneElse(p, [off])).toEqual(everyoneElse(base, [off]));
  });

  test("minutesPlayed lower than the timeline across 60 scores the lower figure, from SofaScore", async () => {
    const keeper = "1140820"; // home keeper, 90 minutes on the timeline
    const p = await prepare(withStats(match, keeper, { minutesPlayed: 55 }));
    expect(p.blockers).toEqual([]);
    const r = rowFor(p, keeper);
    expect(r.stats.minutes).toBe(55);
    expect(r.pendingItems).toEqual([{ category: "appearance", reason: "minutes_conflict" }]);
    expect(p.minutesFromSofascore).toBe(1);
    // He conceded at 48 in both windows (one goal), but the minutes straddle 60: unknown.
    expect(r.evidence.goalsConceded!.state).toBe("unknown");
    expect(r.stats.cleanSheet).toBe(false);
  });

  test("the clean sheet is unknown when the two versions disagree", async () => {
    // Away sub 2790119 came on at 81 (9 minutes); his side conceded nothing after. SofaScore
    // says 65 minutes: on that version he kept a clean sheet; on the timeline he did not.
    const p = await prepare(withStats(match, "2790119", { minutesPlayed: 65 }));
    const r = rowFor(p, "2790119");
    expect(r.stats.minutes).toBe(9);
    expect(r.pendingItems).toEqual([{ category: "appearance", reason: "minutes_conflict" }]);
    expect(unknownOf(r)).toEqual(["cleanSheet"]);
    expect(r.evidence.cleanSheet!.reason).toBe("minutes_conflict");
    // No goal conceded in either window: certified as 0.
    expect(r.stats.goalsConceded).toBe(0);
  });

  test("two versions on the same side of 60 but far apart: SofaScore's minutes, no pending appearance", async () => {
    const off = match.incidents.find((i) => i.kind === "substitution" && i.minute === 86)!
      .playerOut!.externalId!; // 544156, 86 minutes on the timeline
    const p = await prepare(withStats(match, off, { minutesPlayed: 66 }));
    const r = rowFor(p, off);
    expect(r.stats.minutes).toBe(66);
    expect(r.pendingItems).toBeUndefined();
    expect(p.minutesFromSofascore).toBe(1);
    // The 66-minute window ends before 86; the home side conceded at 48 in both: same count.
    expect(r.evidence.goalsConceded!.state).toBe("verified");
  });

  test("agreeing versions (within the tolerance, same side of 60) are unchanged", async () => {
    const off = "919329"; // T 77, SofaScore 80
    const p = await prepare(match);
    expect(rowFor(p, off).stats.minutes).toBe(77);
    expect(rowFor(p, off).pendingItems).toBeUndefined();
  });

  test("a starter whose minutesPlayed is 0 is no longer a verified full appearance", async () => {
    const p = await prepare(withStats(match, "1140820", { minutesPlayed: 0 }));
    expect(p.blockers).toEqual([]);
    const r = rowFor(p, "1140820");
    expect(r.stats.minutes).toBe(1);
    expect(r.pendingItems).toEqual([{ category: "appearance", reason: "minutes_conflict" }]);
  });

  test("no minutesPlayed: only the timeline exists and nothing conflicts", async () => {
    const p = await prepare(
      withStats(match, "919329", { minutesPlayed: null as unknown as number }),
    );
    const r = rowFor(p, "919329");
    expect(r.stats.minutes).toBe(77);
    expect(r.pendingItems).toBeUndefined();
    expect(unknownOf(r)).toEqual([]);
  });

  test("a substitute with minutes but no substitution incident: his minutes are unknown, nobody else's change", async () => {
    const base = await prepare(match);
    const bench = "1095729"; // home bench player who never came on
    const lineups = {
      ...match.lineups,
      players: match.lineups.players.map((pl) =>
        pl.externalId === bench
          ? {
              ...pl,
              stats: {
                minutesPlayed: 4,
                goals: 0,
                assists: 0,
                ownGoals: 0,
                saves: null,
                rating: null,
                penaltyMissed: 0,
              },
            }
          : pl,
      ),
    };
    const p = await prepare({ ...match, lineups });
    expect(p.blockers).toEqual([]);
    const r = rowFor(p, bench);
    expect(r.started).toBe(false);
    expect(unknownOf(r)).toEqual(["cleanSheet", "goalsConceded", "minutes"]);
    for (const f of ["minutes", "goalsConceded", "cleanSheet"] as const)
      expect(r.evidence[f]!.reason).toBe("participation_unexplained");
    expect(r.stats).not.toHaveProperty("minutes");
    expect(p.unknownReasons).toEqual({ participation_unexplained: 3 });
    expect(p.expectedMode).toBe("simple");
    expect(everyoneElse(p, [bench])).toEqual(everyoneElse(base, [bench]));
  });
});

describe("C1: cards (audit: a second yellow held every player)", () => {
  const match = load("17132481");
  const yellow = match.incidents.find((i) => i.kind === "yellow_card")!;
  const keeper = "1140820"; // home keeper: no card in this match
  const card = (kind: "yellow_card" | "second_yellow" | "red_card", minute: number) => ({
    ...yellow,
    kind,
    minute,
    addedMinutes: null,
    player: ref(keeper),
  });

  test("a second yellow is one dismissal: secondYellowDismissals 1, yellowCards 0, redCards 0, and the match is not held", async () => {
    const base = await prepare(match);
    const p = await prepare({
      ...match,
      incidents: [...match.incidents, card("second_yellow", 88)],
    });
    expect(p.blockers).toEqual([]);
    const r = rowFor(p, keeper);
    expect(r.stats.secondYellowDismissals).toBe(1);
    expect(r.stats.yellowCards).toBe(0);
    expect(r.stats.redCards).toBe(0);
    expect(unknownOf(r)).toEqual([]);
    expect(r.stats.minutes).toBe(88); // the dismissal ends his match
    expect(p.expectedMode).toBe("full");
    expect(everyoneElse(p, [keeper])).toEqual(everyoneElse(base, [keeper]));
  });

  test("whether or not the first yellow is also listed gives the same card fields", async () => {
    const without = await prepare({
      ...match,
      incidents: [...match.incidents, card("second_yellow", 88)],
    });
    const withFirst = await prepare({
      ...match,
      incidents: [...match.incidents, card("yellow_card", 60), card("second_yellow", 88)],
    });
    expect(withFirst.blockers).toEqual([]);
    expect(rowFor(withFirst, keeper).stats).toEqual(rowFor(without, keeper).stats);
    expect(rowFor(withFirst, keeper).stats.yellowCards).toBe(0);
  });

  test("two plain yellows and no yellowRed: that player's three card fields are unknown, nobody else is", async () => {
    const base = await prepare(match);
    const p = await prepare({
      ...match,
      incidents: [...match.incidents, card("yellow_card", 20), card("yellow_card", 30)],
    });
    expect(p.blockers).toEqual([]);
    const r = rowFor(p, keeper);
    expect(unknownOf(r)).toEqual(["redCards", "secondYellowDismissals", "yellowCards"]);
    for (const f of ["yellowCards", "redCards", "secondYellowDismissals"] as const) {
      expect(r.evidence[f]!.reason).toBe("card_conflict");
      expect(r.stats).not.toHaveProperty(f);
    }
    expect(r.stats.minutes).toBe(90);
    expect(p.expectedMode).toBe("simple");
    expect(everyoneElse(p, [keeper])).toEqual(everyoneElse(base, [keeper]));
  });

  test("a yellowRed together with a direct red: unknown card fields", async () => {
    const p = await prepare({
      ...match,
      incidents: [...match.incidents, card("second_yellow", 80), card("red_card", 80)],
    });
    expect(p.blockers).toEqual([]);
    expect(unknownOf(rowFor(p, keeper))).toEqual([
      "redCards",
      "secondYellowDismissals",
      "yellowCards",
    ]);
    // And a yellowRed with two yellows listed as well.
    const q = await prepare({
      ...match,
      incidents: [
        ...match.incidents,
        card("yellow_card", 10),
        card("yellow_card", 20),
        card("second_yellow", 80),
      ],
    });
    expect(unknownOf(rowFor(q, keeper))).toEqual([
      "redCards",
      "secondYellowDismissals",
      "yellowCards",
    ]);
  });

  test("an ordinary yellow, a yellow then a direct red, and a direct red are scored as before", async () => {
    const p = await prepare({
      ...match,
      incidents: [...match.incidents, card("yellow_card", 20), card("red_card", 85)],
    });
    const r = rowFor(p, keeper);
    expect(r.stats.yellowCards).toBe(1);
    expect(r.stats.redCards).toBe(1);
    expect(r.stats.secondYellowDismissals).toBe(0);
  });
});

describe("C1: own goals (audit: goal/ownGoal held every player)", () => {
  const match = load("17132481");
  const goal = match.incidents.find((i) => i.kind === "goal" && i.side === "home")!;
  const ownGoal = (player: string | null, side: "home" | "away", minute = 30) => ({
    ...goal,
    kind: "unknown" as const,
    rawType: "goal",
    rawClass: "ownGoal",
    side,
    minute,
    addedMinutes: null,
    assist: null,
    player: player ? ref(player) : null,
  });
  const homeKeeper = "1140820";
  const awayKeeper = "919753";
  /** The home keeper puts it into his own net: the goal counts for the away side. */
  const ownByHome = (side: "home" | "away") => ({
    ...match,
    summary: { ...match.summary, awayScore: (match.summary.awayScore ?? 0) + 1 },
    incidents: [...match.incidents, ownGoal(homeKeeper, side)],
    lineups: {
      ...match.lineups,
      players: match.lineups.players.map((pl) =>
        pl.externalId === homeKeeper ? { ...pl, stats: { ...pl.stats!, ownGoals: 1 } } : pl,
      ),
    },
  });

  test("the own goal is credited to the other side of the named player's lineup side, and counts in his side's goals conceded", async () => {
    const base = await prepare(match);
    const p = await prepare(ownByHome("home"));
    expect(p.blockers).toEqual([]);
    const r = rowFor(p, homeKeeper);
    expect(r.stats.ownGoals).toBe(1);
    expect(r.evidence.ownGoals!.state).toBe("verified");
    expect(r.stats.goals).toBe(0);
    // Home conceded the goal at 48 and now this one; the away keeper conceded only what he did.
    expect(r.stats.goalsConceded).toBe(
      (rowFor(base, homeKeeper).stats.goalsConceded as number) + 1,
    );
    expect(rowFor(p, awayKeeper).stats.goalsConceded).toBe(
      rowFor(base, awayKeeper).stats.goalsConceded,
    );
    expect(scoredUnknown(r)).toEqual([]);
  });

  test("isHome on the incident is not relied on: both sides give the identical request", async () => {
    const a = await prepare(ownByHome("home"));
    const b = await prepare(ownByHome("away"));
    expect(a.blockers).toEqual([]);
    expect(b.blockers).toEqual([]);
    expect(b.requestDigest).toBe(a.requestDigest);
  });

  test("an own goal by an away player counts for the home side", async () => {
    const base = await prepare(match);
    const p = await prepare({
      ...match,
      summary: { ...match.summary, homeScore: (match.summary.homeScore ?? 0) + 1 },
      incidents: [...match.incidents, ownGoal(awayKeeper, "away")],
      lineups: {
        ...match.lineups,
        players: match.lineups.players.map((pl) =>
          pl.externalId === awayKeeper ? { ...pl, stats: { ...pl.stats!, ownGoals: 1 } } : pl,
        ),
      },
    });
    expect(p.blockers).toEqual([]);
    expect(rowFor(p, awayKeeper).stats.ownGoals).toBe(1);
    expect(rowFor(p, awayKeeper).stats.goalsConceded).toBe(
      (rowFor(base, awayKeeper).stats.goalsConceded as number) + 1,
    );
    expect(rowFor(p, homeKeeper).stats.goalsConceded).toBe(
      rowFor(base, homeKeeper).stats.goalsConceded,
    );
  });

  test("a lineup ownGoals that disagrees with the player's events makes his ownGoals unknown, not the match held", async () => {
    // Lineup says one, no event: the goals still add up, so the match is not held.
    const noEvent = await prepare(withStats(match, "1140820", { ownGoals: 1 }));
    expect(noEvent.blockers).toEqual([]);
    expect(unknownOf(rowFor(noEvent, "1140820"))).toEqual(["ownGoals"]);
    expect(rowFor(noEvent, "1140820").evidence.ownGoals!.reason).toBe("own_goal_conflict");
    expect(rowFor(noEvent, "1140820").stats).not.toHaveProperty("ownGoals");
    // Event, lineup says none.
    const m = ownByHome("home");
    const zero = await prepare(withStats(m, "1140820", { ownGoals: 0 }));
    expect(zero.blockers).toEqual([]);
    expect(scoredUnknown(rowFor(zero, "1140820"))).toEqual(["ownGoals"]);
  });

  test("negative controls: no player, a player not in the lineup, or goals that do not add up still hold", async () => {
    const nobody = await prepare({
      ...match,
      incidents: [...match.incidents, ownGoal(null, "home")],
    });
    expect(nobody.blockers.map((b) => b.code)).toEqual(["own_goal_unexplained"]);
    expect(nobody.request).toBeNull();
    const stranger = await prepare({
      ...match,
      summary: { ...match.summary, awayScore: (match.summary.awayScore ?? 0) + 1 },
      incidents: [...match.incidents, ownGoal("999999999", "home")],
    });
    expect(stranger.blockers.map((b) => b.code)).toContain("own_goal_unexplained");
    expect(stranger.blockers.map((b) => b.code)).toContain("incident_player_not_in_lineup");
    expect(stranger.request).toBeNull();
    // The score was not raised: the credited goal makes the away goals one too many.
    const unbalanced = await prepare({
      ...match,
      incidents: [...match.incidents, ownGoal(homeKeeper, "home")],
    });
    expect(unbalanced.blockers.map((b) => b.code)).toContain("goals_do_not_add_up");
    expect(unbalanced.request).toBeNull();
    // A player on the bench who never played cannot have scored one.
    const benched = await prepare({
      ...match,
      summary: { ...match.summary, awayScore: (match.summary.awayScore ?? 0) + 1 },
      incidents: [...match.incidents, ownGoal("1095729", "home")],
    });
    expect(benched.blockers.map((b) => b.code)).toContain("own_goal_unexplained");
  });
});

describe("C1: parsing tolerance reaches the builder (audit: null rating, null position, null incident class)", () => {
  const f = (name: string) => structuredClone(providerFixture("sofascore", `17132481.${name}`));

  test("a null rating, a null position and a null incident class still produce a request, with diagnostics", async () => {
    const lineupsRaw = f("lineups") as {
      home: { players: { player: Record<string, unknown>; statistics: Record<string, unknown> }[] };
    };
    lineupsRaw.home.players[0]!.statistics.rating = null;
    lineupsRaw.home.players[3]!.player.position = null;
    const incidentsRaw = f("incidents") as { incidents: Record<string, unknown>[] };
    incidentsRaw.incidents.push({
      incidentType: "varDecision",
      incidentClass: null,
      time: 30,
      isHome: true,
    });
    incidentsRaw.incidents.push({ incidentType: "varDecision" });
    const lineups = parseSofascoreLineupsDetailed(lineupsRaw);
    const incidents = parseSofascoreIncidentsDetailed(incidentsRaw);
    const diagnostics = [...lineups.diagnostics, ...incidents.diagnostics];
    expect(diagnostics.length).toBe(4);
    const base = load("17132481");
    const p = await prepare({
      ...base,
      lineups: lineups.lineups,
      incidents: incidents.incidents,
      diagnostics,
    });
    expect(p.blockers).toEqual([]);
    expect(p.request).not.toBeNull();
    expect(p.diagnostics).toEqual(diagnostics);
    // Nothing scored changed: the rows are those of the untouched match (position only
    // chooses the keeper fields, and the player with no position here is an outfield one).
    const plain = await prepare(base);
    expect(p.request!.payload.players.map((r) => r.stats)).toEqual(
      plain.request!.payload.players.map((r) => r.stats),
    );
    // The diagnostics are not part of the request (and so not of its digest).
    expect(p.requestDigest).toBe(plain.requestDigest);
  });

  test("a wrong type on a scored field still fails before the builder is reached", () => {
    const lineupsRaw = f("lineups") as {
      home: { players: { statistics: Record<string, unknown> }[] };
    };
    lineupsRaw.home.players[0]!.statistics.minutesPlayed = "90";
    expect(() => parseSofascoreLineupsDetailed(lineupsRaw)).toThrow(SofascoreParseError);
    const goals = f("lineups") as { home: { players: { statistics: Record<string, unknown> }[] } };
    goals.home.players[0]!.statistics.goals = "1";
    expect(() => parseSofascoreLineupsDetailed(goals)).toThrow(SofascoreParseError);
  });
});

describe("C1: what stays held", () => {
  const match = load("17132481");

  test("goals that do not add up to the score, a score the incidents contradict, and an unmapped scorer", async () => {
    const short = await prepare({
      ...match,
      incidents: match.incidents.filter((i) => !(i.kind === "goal" && i.side === "away")),
    });
    expect(short.blockers.map((b) => b.code)).toContain("goals_do_not_add_up");
    const wrongScore = await prepare({
      ...match,
      summary: { ...match.summary, homeScore: 5 },
    });
    expect(wrongScore.blockers.map((b) => b.code)).toContain("goals_do_not_add_up");
    const scorer = await prepare(match, {}, ["895127"]);
    expect(scorer.blockers.map((b) => b.code)).toContain("unmapped_players");
    for (const p of [short, wrongScore, scorer]) expect(p.request).toBeNull();
  });

  test("a goal by a player who is not in the lineup", async () => {
    const goal = match.incidents.find((i) => i.kind === "goal" && i.side === "home")!;
    const p = await prepare({
      ...match,
      incidents: match.incidents.map((i) => (i === goal ? { ...i, player: ref("424242") } : i)),
    });
    expect(p.blockers.map((b) => b.code)).toContain("incident_player_not_in_lineup");
    expect(p.request).toBeNull();
  });
});
