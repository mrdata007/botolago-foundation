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
    const over = await prepare(withStats(match, off, { minutesPlayed: baseMinutes + 7 }));
    expect(over.blockers.map((b) => b.code)).toContain("minutes_mismatch");
    expect(over.request).toBeNull();
    const under = await prepare(withStats(match, off, { minutesPlayed: baseMinutes - 3 }));
    expect(under.blockers.map((b) => b.code)).toContain("minutes_mismatch");
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
    // Seven over: refused with no stoppage known, or with 4 announced (limit stays 6) ...
    expect((await prepare(announced(null))).blockers.map((b) => b.code)).toContain(
      "minutes_mismatch",
    );
    expect((await prepare(announced(4))).blockers.map((b) => b.code)).toContain("minutes_mismatch");
    // ... accepted with 5 announced (limit 7), and 8 over is still refused then.
    expect((await prepare(announced(5))).blockers).toEqual([]);
    const eight = {
      ...withStats(match, off, { minutesPlayed: minutes + 8 }),
      stoppage: { firstHalf: 5, secondHalf: null },
    };
    expect((await prepare(eight)).blockers.map((b) => b.code)).toContain("minutes_mismatch");
    // A first-half incident at 45+6 proves at least six minutes were played: limit 8.
    const card = match.incidents.find((i) => i.kind === "yellow_card")!;
    const late = {
      ...withStats(match, off, { minutesPlayed: minutes + 8 }),
      incidents: [...match.incidents, { ...card, minute: 45, addedMinutes: 6 }],
    };
    expect((await prepare(late)).blockers).toEqual([]);
    // Period markers carry 999 added minutes: never read as stoppage time.
    const marker = {
      ...withStats(match, off, { minutesPlayed: minutes + 7 }),
      incidents: [...match.incidents, { ...card, minute: 45, addedMinutes: 999 }],
    };
    expect((await prepare(marker)).blockers.map((b) => b.code)).toContain("minutes_mismatch");
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

  test("a replaced player whose exit the incidents do not carry still fails the minutes check", async () => {
    const match = load("17132481");
    const m: SofascoreMatchData = {
      ...match,
      incidents: match.incidents.map((i) =>
        i.kind === "substitution" && i.playerIn?.externalId === "1213241"
          ? { ...i, playerOut: null }
          : i,
      ),
    };
    // 1213241 came on at 73' for 1894253, whose SofaScore minutes (73) no longer fit a full match.
    const p = await prepare(m, {}, ["1213241"]);
    expect(p.request).toBeNull();
    expect(p.blockers.map((b) => b.code)).toContain("minutes_mismatch");
  });

  test("an unknown substitute with minutes but no substitution incident is still unexplained", async () => {
    const match = load("17132481");
    const m: SofascoreMatchData = {
      ...match,
      incidents: match.incidents.filter(
        (i) => !(i.kind === "substitution" && i.playerIn?.externalId === subHome),
      ),
    };
    const p = await prepare(withStats(m, subHome, { minutesPlayed: 4 }), {}, [subHome]);
    expect(p.blockers.map((b) => b.code)).toContain("appearance_unexplained");
    expect(p.request).toBeNull();
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
