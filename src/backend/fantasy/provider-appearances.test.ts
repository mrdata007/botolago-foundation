/**
 * SYNTHETIC tests of who is accounted for in a match and on what evidence (hand-built
 * matches, see provider-test-world.ts). Real payloads are in provider-identity-worklist.real.test.ts.
 */
import { describe, expect, test } from "bun:test";
import type {
  PerformanceIncident,
  PerformanceLineupPlayer,
} from "../football/provider/performance-contracts";
import { classifyAppearances, type ParticipationState } from "./provider-appearances";
import type { ProviderMatchData } from "./provider-reconciler";
import { build, fid, sid, type Spec } from "./provider-test-world";
import { buildWorklist, type WorklistInput } from "./provider-identity-worklist";
import { replayFixture } from "./provider-replay";
import { row, snapshot, linkOf } from "./provider-test-world";

const incident = (
  provider: "sofascore" | "flashscore",
  over: Partial<PerformanceIncident> & Pick<PerformanceIncident, "kind">,
): PerformanceIncident => ({
  provider,
  side: "home",
  minute: 50,
  addedMinutes: null,
  player: null,
  assist: null,
  playerIn: null,
  playerOut: null,
  rawType: over.kind,
  rawClass: null,
  ...over,
});
const ref = (id: string) => ({ externalId: id, name: "n" });
/** A bench player (shirt 12, home) in both providers, not a starter. */
const bench = (
  provider: "sofascore" | "flashscore",
  minutes: number | null,
): PerformanceLineupPlayer => ({
  provider,
  externalId: provider === "sofascore" ? sid("home", 12) : fid("home", 12),
  name: "n",
  side: "home",
  shirtNumber: 12,
  position: null,
  starter: false,
  stats:
    minutes === null
      ? null
      : {
          minutesPlayed: minutes,
          goals: 0,
          assists: 0,
          ownGoals: 0,
          saves: null,
          rating: null,
          penaltyMissed: 0,
        },
});
const withBench = (
  spec: Spec,
  provider: "sofascore" | "flashscore",
  minutes: number | null,
  incidents: PerformanceIncident[] = [],
): ProviderMatchData => {
  const data = build(spec)[provider];
  return {
    ...data,
    lineups: { ...data.lineups, players: [...data.lineups.players, bench(provider, minutes)] },
    incidents: [...data.incidents, ...incidents],
  };
};
const one = (data: ProviderMatchData, provider: "sofascore" | "flashscore", id: string) =>
  classifyAppearances(data, provider).find((r) => r.externalId === id);
const BENCH = sid("home", 12);

describe("SYNTHETIC: who is accounted for, and on what evidence", () => {
  test("a starter is verified participation", () => {
    const r = one(build().sofascore, "sofascore", sid("home", 5));
    expect([r?.evidence, r?.state]).toEqual(["STARTER", "VERIFIED"]);
  });

  test("brought on by a substitution incident: verified", () => {
    const data = withBench({}, "sofascore", 20, [
      incident("sofascore", {
        kind: "substitution",
        playerIn: ref(BENCH),
        playerOut: ref(sid("home", 5)),
      }),
    ]);
    const r = one(data, "sofascore", BENCH);
    expect([r?.evidence, r?.state, r?.discrepancies]).toEqual(["SUBSTITUTED_IN", "VERIFIED", []]);
  });

  test("positive minutes but NO substitution incident: still accounted for, with the feed gap visible", () => {
    const r = one(withBench({}, "sofascore", 25), "sofascore", BENCH);
    expect(r).toMatchObject({
      evidence: "MINUTES_WITHOUT_SUBSTITUTION_INCIDENT",
      state: "VERIFIED",
      discrepancies: ["minutes_recorded_without_substitution_incident"],
    });
    expect(r?.lineup?.externalId).toBe(BENCH);
  });

  test("a non-playing substitute with a card: bench disciplinary evidence, participation UNKNOWN (not played, not verified)", () => {
    const data = withBench({}, "sofascore", 0, [
      incident("sofascore", { kind: "yellow_card", player: ref(BENCH) }),
    ]);
    const r = one(data, "sofascore", BENCH);
    expect(r).toMatchObject({
      evidence: "BENCH_INCIDENT_ONLY",
      state: "UNKNOWN",
      carded: true,
      scoringRelevant: true,
    });
    expect(r?.discrepancies).toEqual(["bench_player_named_in_incident"]);
  });

  test("a bench player nobody mentions, with no minutes, is not accounted for and not called 'did not play'", () => {
    const records = classifyAppearances(withBench({}, "sofascore", null), "sofascore");
    expect(records.find((x) => x.externalId === BENCH)).toBeUndefined();
    // Silence is not an assertion: no record, and no record type says 'did not play'.
    const states: ParticipationState[] = ["VERIFIED", "CONTRADICTORY", "UNKNOWN"];
    expect(states).not.toContain("NOT_PLAYED" as never);
  });

  test("an incident naming an id absent from the lineup stays visible and no lineup entry is invented", () => {
    const base = build().sofascore;
    const data: ProviderMatchData = {
      ...base,
      incidents: [incident("sofascore", { kind: "red_card", player: ref("ghost-1") })],
    };
    const r = one(data, "sofascore", "ghost-1");
    expect(r).toMatchObject({
      evidence: "INCIDENT_ONLY_NOT_IN_LINEUP",
      state: "UNKNOWN",
      lineup: null,
      side: "home",
      carded: true,
    });
    expect(r?.discrepancies).toEqual(["incident_names_id_absent_from_lineup"]);
    expect(data.lineups.players.some((p) => p.externalId === "ghost-1")).toBe(false);
  });

  test("a starter with 0 recorded minutes is contradictory participation, kept visible", () => {
    const data = build().sofascore;
    const players = data.lineups.players.map((p) =>
      p.externalId === sid("home", 5)
        ? {
            ...p,
            stats: {
              minutesPlayed: 0,
              goals: 0,
              assists: 0,
              ownGoals: 0,
              saves: null,
              rating: null,
              penaltyMissed: 0,
            },
          }
        : p,
    );
    const r = one({ ...data, lineups: { ...data.lineups, players } }, "sofascore", sid("home", 5));
    expect([r?.state, r?.discrepancies]).toEqual([
      "CONTRADICTORY",
      ["starter_with_zero_recorded_minutes"],
    ]);
  });

  test("unknown minutes (no statistics) never turn a substitute into a non-participant", () => {
    const data = withBench({}, "sofascore", null, [
      incident("sofascore", {
        kind: "substitution",
        playerIn: ref(BENCH),
        playerOut: ref(sid("home", 5)),
      }),
    ]);
    expect(one(data, "sofascore", BENCH)?.state).toBe("VERIFIED");
  });
});

const T = {
  payloadObservedAt: "2026-10-01T12:00:00.000Z",
  mappingSnapshotCapturedAt: "x",
  candidateRecordsReadAt: "x",
  corroborationObservedAt: null,
};

describe("SYNTHETIC: the worklist and replay keep these identities visible", () => {
  const make = (flash: ProviderMatchData, sofa: ProviderMatchData) => ({
    link: linkOf(),
    sofascore: sofa,
    flashscore: flash,
  });
  const input = async (f: ReturnType<typeof make>): Promise<WorklistInput> => ({
    fixtures: [f],
    snapshot: await snapshot([]),
    flashCandidates: f.flashscore.lineups.players.map((p) => ({
      candidateId: `c-${p.externalId}`,
      externalId: p.externalId,
      status: "unmapped",
      rev: 1,
      club: null,
      complete: "COMPLETE",
    })),
    sofaCandidates: [],
    lockedSquadAppPlayerIds: new Set(),
    corroboration: [],
    times: T,
  });
  const find = (w: Awaited<ReturnType<typeof buildWorklist>>, provider: string, id: string) =>
    w.rows.find((r) => r.provider === provider && r.externalId === id);

  test("a player with minutes but no substitution incident is a worklist row with participation evidence", async () => {
    const f = make(withBench({}, "flashscore", null), withBench({}, "sofascore", 25));
    const w = await buildWorklist(await input(f));
    const r = find(w, "sofascore", BENCH);
    expect(r?.participation).toMatchObject({
      evidence: ["MINUTES_WITHOUT_SUBSTITUTION_INCIDENT"],
      state: "VERIFIED",
      discrepancies: ["minutes_recorded_without_substitution_incident"],
    });
  });

  test("a bench card keeps an unresolved identity in the worklist, with participation UNKNOWN", async () => {
    const card = [incident("flashscore", { kind: "yellow_card", player: ref(fid("home", 12)) })];
    const f = make(withBench({}, "flashscore", null, card), build().sofascore);
    const w = await buildWorklist(await input(f));
    const r = find(w, "flashscore", fid("home", 12));
    expect(r).toBeDefined();
    expect(r?.participation).toMatchObject({
      state: "UNKNOWN",
      scoringRelevant: true,
      incidentOnly: false,
    });
    expect(r?.priority).toContain("carded");
  });

  test("an incident-only id is a row that can never be READY, and 'no candidate' stays distinct", async () => {
    const ghost = [incident("flashscore", { kind: "red_card", player: ref("ghost-1") })];
    const flash = { ...build().flashscore, incidents: ghost };
    const f = make(flash, build().sofascore);
    const w = await buildWorklist(await input(f));
    const r = find(w, "flashscore", "ghost-1");
    expect(r?.classification).toBe("CANDIDATE_RECORD_MISSING");
    expect(r?.participation).toMatchObject({ incidentOnly: true, state: "UNKNOWN" });
    expect(r?.missingEvidence.join(" ")).toContain("lineup entry");
    // With a candidate record the row is insufficient evidence, never ready.
    const withCand = await input(f);
    const w2 = await buildWorklist({
      ...withCand,
      flashCandidates: [
        ...withCand.flashCandidates,
        {
          candidateId: "c-ghost",
          externalId: "ghost-1",
          status: "unmapped",
          rev: 1,
          club: null,
          complete: "COMPLETE",
        },
      ],
    });
    expect(find(w2, "flashscore", "ghost-1")?.classification).toBe("INSUFFICIENT_EVIDENCE");
  });

  test("the replay does not resolve identities while a bench card or an incident-only id is unresolved", async () => {
    const card = [incident("flashscore", { kind: "yellow_card", player: ref(fid("home", 12)) })];
    const ghost = [incident("sofascore", { kind: "red_card", player: ref("ghost-1") })];
    const sofa = { ...build().sofascore, incidents: ghost };
    const flash = withBench({}, "flashscore", null, card);
    // Every starter is reviewed on both providers, so only the new groups can hold identity back.
    const rows = (["home", "away"] as const).flatMap((side) =>
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].flatMap((n) => [
        row(
          "sofascore",
          sid(side, n),
          `00000000-0000-4000-8000-${side === "home" ? "1" : "2"}${String(n).padStart(11, "0")}`,
        ),
        row(
          "flashscore",
          fid(side, n),
          `00000000-0000-4000-8000-${side === "home" ? "1" : "2"}${String(n).padStart(11, "0")}`,
        ),
      ]),
    );
    const r = replayFixture({
      observedAt: T.payloadObservedAt,
      sofascore: sofa,
      flashscore: flash,
      snapshot: await snapshot(rows),
    });
    expect(r.coverage.sofascore.incidentOnlyUnresolvedIds).toEqual(["ghost-1"]);
    expect(r.coverage.flashscore.benchIncidentUnresolvedIds).toEqual([fid("home", 12)]);
    expect(r.stages.identityResolved).toBe(false);
    expect(r.stages.participationEstablished).toBe(false);
    expect(r.blockers.some((b) => b.includes("bench player(s) named in a scoring incident"))).toBe(
      true,
    );
    expect(r.blockers.some((b) => b.includes("in no lineup"))).toBe(true);
    // Positive control: without them the same snapshot resolves identity.
    const clean = replayFixture({
      observedAt: T.payloadObservedAt,
      ...build(),
      snapshot: await snapshot(rows),
    });
    expect(clean.stages.identityResolved).toBe(true);
  });

  test("a failed corroboration request is never verified non-participation or agreement", async () => {
    // NOT_FETCHED results are dropped before they reach the worklist: nothing is inferred from a failure.
    const f = make(build().flashscore, build().sofascore);
    const w = await buildWorklist({
      ...(await input(f)),
      corroboration: [],
    });
    const r = find(w, "flashscore", fid("home", 5));
    expect(r?.participation.state).toBe("VERIFIED");
    expect(r?.evidence).not.toMatchObject({ dobCorroboration: "AGREE" });
  });
});
