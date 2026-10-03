import { describe, expect, test } from "bun:test";
import { canonicalJson } from "../football/identity/bulk-mapping/canonical";
import type { ProviderMatchData } from "./provider-reconciler";
import { build, DEFAULT_SHIRTS, fid, OBSERVED_AT, row, sid, snapshot } from "./provider-test-world";
import {
  classifyRpcError,
  ingestReconciledFixtures,
  prepareReconciledObservation,
  ReconciledIngestionError,
  SupabaseReconciledObservationGateway,
  type PreparedObservation,
  type ReconciledObservationGateway,
  type ReconciledObservationRequest,
  type RecordedObservation,
} from "./reconciled-ingestion";
import type { MappingRowInput } from "./reviewed-identities";

const FIXTURE = "f0000000-0000-4000-8000-000000000001";
const HOME = "c1000000-0000-4000-8000-000000000001";
const AWAY = "c1000000-0000-4000-8000-000000000002";
const binding = { appFixtureId: FIXTURE, homeTeamId: HOME, awayTeamId: AWAY };
const appId = (n: number) => `a1000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

/** A synthetic finished match, home 1 - 0, every starter with Sofascore minutes: ingestion-ready. */
function match(over: { flashScore?: number } = {}): {
  sofascore: ProviderMatchData;
  flashscore: ProviderMatchData;
} {
  const m = build({
    goals: [["home", 30, 9, 9]],
    sofascoreFixtureId: "9001",
    flashscoreFixtureId: "AbC1",
  });
  return {
    sofascore: {
      ...m.sofascore,
      lineups: {
        ...m.sofascore.lineups,
        fullCoverage: true,
        players: m.sofascore.lineups.players.map((p) => ({
          ...p,
          position: p.shirtNumber === 1 ? "G" : "M",
          stats: {
            minutesPlayed: 90,
            goals: p.side === "home" && p.shirtNumber === 9 ? 1 : 0,
            assists: 0,
            ownGoals: 0,
            saves: 0,
            rating: 7.1,
            penaltyMissed: 0,
          },
        })),
      },
    },
    flashscore:
      over.flashScore === undefined
        ? m.flashscore
        : { ...m.flashscore, summary: { ...m.flashscore.summary, homeScore: over.flashScore } },
  };
}

function mappingRows(
  skip: (provider: string, side: string, shirt: number) => boolean = () => false,
) {
  const rows: MappingRowInput[] = [];
  let n = 0;
  for (const side of ["home", "away"] as const) {
    for (const shirt of DEFAULT_SHIRTS) {
      n++;
      if (!skip("sofascore", side, shirt)) rows.push(row("sofascore", sid(side, shirt), appId(n)));
      if (!skip("flashscore", side, shirt))
        rows.push(row("flashscore", fid(side, shirt), appId(n)));
    }
  }
  return rows;
}

async function prepare(
  over: { rows?: MappingRowInput[]; flashScore?: number; binding?: typeof binding } = {},
) {
  return prepareReconciledObservation({
    observedAt: OBSERVED_AT,
    ...match({ flashScore: over.flashScore }),
    snapshot: await snapshot(over.rows ?? mappingRows()),
    binding: over.binding ?? binding,
  });
}

describe("prepareReconciledObservation", () => {
  test("an ingestion-ready match becomes one request with 22 reviewed rows", async () => {
    const p = await prepare();
    expect(p.blockers).toEqual([]);
    expect(p.stages.ingestionReady).toBe(true);
    const req = p.request as ReconciledObservationRequest;
    expect(req.sofascoreEventId).toBe("9001");
    expect(req.flashscoreEventId).toBe("AbC1");
    expect(req.payload.homeScore).toBe(1);
    expect(req.payload.awayScore).toBe(0);
    expect(req.payload.players).toHaveLength(22);
    expect(req.payload.players.filter((r) => r.teamId === HOME && r.started)).toHaveLength(11);
    expect(req.payload.players.filter((r) => r.teamId === AWAY && r.started)).toHaveLength(11);
    const scorer = req.payload.players.find((r) => r.playerId === appId(9));
    expect(scorer?.identity).toEqual({ sofascoreId: sid("home", 9), flashscoreId: fid("home", 9) });
    expect(scorer?.stats.goals).toBe(1);
    expect(scorer?.evidence.goals?.state).toBe("verified");
    expect(req.payload.participationComplete).toBe(true);
    expect(req.payload.disciplineComplete).toBe(true);
    expect(req.payload.anonymousStarters).toBe(0);
  });

  test("the request carries no names and no rating", async () => {
    const text = canonicalJson((await prepare()).request);
    expect(text).not.toContain("sofascore home");
    expect(text).not.toContain("displayName");
    expect(text).not.toContain("rating");
  });

  test("the same inputs always give the same request digest", async () => {
    const a = await prepare();
    const b = await prepare();
    expect(a.requestDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(a.requestDigest).toBe(b.requestDigest);
  });

  test("a player who appeared without a reviewed Flashscore identity blocks the whole match", async () => {
    const p = await prepare({
      rows: mappingRows(
        (prov, side, shirt) => prov === "flashscore" && side === "away" && shirt === 4,
      ),
    });
    expect(p.request).toBeNull();
    expect(p.blockers.map((b) => b.code)).toContain("not_ingestion_ready");
    expect(p.blockers.map((b) => b.code)).toContain("identity_not_reviewed_pair");
  });

  test("providers that disagree on the final score are not sent", async () => {
    const p = await prepare({ flashScore: 2 });
    expect(p.request).toBeNull();
    expect(p.blockers.map((b) => b.code)).toContain("score_missing_or_disagrees");
  });

  test("a binding that is not three UUIDs, or uses one team twice, is refused", async () => {
    expect(
      (await prepare({ binding: { ...binding, appFixtureId: "fixture-1" } })).blockers.map(
        (b) => b.code,
      ),
    ).toContain("binding_invalid");
    expect(
      (await prepare({ binding: { ...binding, awayTeamId: HOME } })).blockers.map((b) => b.code),
    ).toContain("binding_invalid");
  });
});

// ---------------------------------------------------------------------------

const recorded = (over: Partial<RecordedObservation> = {}): RecordedObservation => ({
  observationId: 7,
  digest: "d".repeat(64),
  fullReady: true,
  simpleReady: true,
  created: true,
  latest: true,
  dryRun: false,
  reviewedOverride: false,
  ...over,
});

/** Stands in for the database: one row per (fixture, request), and it can lose an answer after writing. */
class FakeDatabase implements ReconciledObservationGateway {
  readonly stored = new Map<string, number>();
  calls = 0;
  loseNextAnswer = false;
  failNext: ReconciledIngestionError[] = [];
  async record(fixture: string, request: ReconciledObservationRequest, dryRun: boolean) {
    this.calls++;
    const next = this.failNext.shift();
    if (next) throw next;
    const key = `${fixture}:${canonicalJson(request)}`;
    const existing = this.stored.get(key);
    if (dryRun) return recorded({ dryRun: true, created: existing === undefined });
    if (existing === undefined) this.stored.set(key, this.stored.size + 1);
    if (this.loseNextAnswer) {
      this.loseNextAnswer = false;
      throw new ReconciledIngestionError("network_error", true, "lost");
    }
    return recorded({ observationId: this.stored.get(key), created: existing === undefined });
  }
}

const noSleep = async () => {};

describe("ingestReconciledFixtures", () => {
  test("dry run: the database is asked with dryRun and nothing is stored", async () => {
    const db = new FakeDatabase();
    const report = await ingestReconciledFixtures([await prepare()], {
      mode: "dry-run",
      gateway: db,
      sleep: noSleep,
    });
    expect(report.fixtures[0].outcome.status).toBe("dry-run-ok");
    expect(db.stored.size).toBe(0);
    expect(report.ok).toBe(true);
  });

  test("record, then the same run again: stored once, the second run says already recorded", async () => {
    const db = new FakeDatabase();
    const p = [await prepare()];
    const first = await ingestReconciledFixtures(p, {
      mode: "record",
      gateway: db,
      sleep: noSleep,
    });
    const second = await ingestReconciledFixtures(p, {
      mode: "record",
      gateway: db,
      sleep: noSleep,
    });
    expect(first.fixtures[0].outcome.status).toBe("recorded");
    expect(second.fixtures[0].outcome.status).toBe("already-recorded");
    expect(db.stored.size).toBe(1);
  });

  test("a lost answer after the write is retried and does not store twice", async () => {
    const db = new FakeDatabase();
    db.loseNextAnswer = true;
    const report = await ingestReconciledFixtures([await prepare()], {
      mode: "record",
      gateway: db,
      sleep: noSleep,
    });
    const outcome = report.fixtures[0].outcome;
    expect(outcome.status).toBe("already-recorded");
    expect("attempts" in outcome && outcome.attempts).toBe(2);
    expect(db.stored.size).toBe(1);
  });

  test("a call that keeps failing transiently ends uncertain after the attempt limit, with backoff", async () => {
    const db = new FakeDatabase();
    db.failNext = [1, 2, 3].map(() => new ReconciledIngestionError("database_busy", true, "busy"));
    const waits: number[] = [];
    const report = await ingestReconciledFixtures([await prepare()], {
      mode: "record",
      gateway: db,
      sleep: async (ms) => void waits.push(ms),
    });
    expect(report.fixtures[0].outcome).toMatchObject({
      status: "uncertain",
      code: "database_busy",
      attempts: 3,
    });
    expect(waits).toEqual([500, 1000]);
    expect(report.ok).toBe(false);
  });

  test("a refusal is reported with the database's code and is never retried", async () => {
    const db = new FakeDatabase();
    db.failNext = [
      new ReconciledIngestionError(
        "reconciled_identity_not_reviewed",
        false,
        "no",
        "flashscore:f-a4",
      ),
    ];
    const report = await ingestReconciledFixtures([await prepare()], {
      mode: "record",
      gateway: db,
      sleep: noSleep,
    });
    expect(report.fixtures[0].outcome).toMatchObject({
      status: "refused",
      code: "reconciled_identity_not_reviewed",
      detail: "flashscore:f-a4",
      attempts: 1,
    });
    expect(db.calls).toBe(1);
  });

  test("a blocked match never reaches the database; the others still run", async () => {
    const db = new FakeDatabase();
    const blocked = await prepare({ flashScore: 2 });
    const report = await ingestReconciledFixtures([blocked, await prepare()], {
      mode: "record",
      gateway: db,
      sleep: noSleep,
    });
    expect(report.fixtures.map((f) => f.outcome.status)).toEqual(["blocked", "recorded"]);
    expect(db.calls).toBe(1);
    expect(report.counts).toEqual({ blocked: 1, recorded: 1 });
  });

  test("a refusal that would repeat for every fixture (no permission, migration missing) stops the run", async () => {
    const db = new FakeDatabase();
    db.failNext = [new ReconciledIngestionError("function_missing", false, "missing")];
    const one = await prepare();
    const report = await ingestReconciledFixtures([one, one], {
      mode: "dry-run",
      gateway: db,
      sleep: noSleep,
    });
    expect(report.fixtures.map((f) => f.outcome.status)).toEqual(["refused", "not-attempted"]);
    expect(db.calls).toBe(1);
  });

  test("a dry run the database did not confirm is treated as a failure", async () => {
    const gateway: ReconciledObservationGateway = {
      record: async () => recorded({ dryRun: false }),
    };
    const report = await ingestReconciledFixtures([await prepare()], {
      mode: "dry-run",
      gateway,
      sleep: noSleep,
    });
    expect(report.fixtures[0].outcome).toMatchObject({
      status: "refused",
      code: "dry_run_not_honoured",
    });
  });

  test("a reviewed correction in force is reported, not counted as recorded", async () => {
    const gateway: ReconciledObservationGateway = {
      record: async () => recorded({ reviewedOverride: true, created: false }),
    };
    const report = await ingestReconciledFixtures([await prepare()], {
      mode: "record",
      gateway,
      sleep: noSleep,
    });
    expect(report.fixtures[0].outcome.status).toBe("reviewed-correction-in-force");
    expect(report.ok).toBe(false);
  });

  test("an observation that is not the latest carries a warning", async () => {
    const gateway: ReconciledObservationGateway = {
      record: async () => recorded({ latest: false, created: false }),
    };
    const report = await ingestReconciledFixtures([await prepare()], {
      mode: "record",
      gateway,
      sleep: noSleep,
    });
    const outcome = report.fixtures[0].outcome as { warnings: string[] };
    expect(outcome.warnings[0]).toContain("newer observation");
  });
});

describe("SupabaseReconciledObservationGateway", () => {
  const client = (
    answer: () => Promise<{
      data: unknown;
      error: { message?: string; code?: string; details?: string | null } | null;
    }>,
  ) => {
    const calls: { fn: string; args: Record<string, unknown> }[] = [];
    return {
      calls,
      client: {
        schema: (name: "api") => {
          expect(name).toBe("api");
          return {
            rpc: (fn: string, args: Record<string, unknown>) => {
              calls.push({ fn, args });
              return answer();
            },
          };
        },
      },
    };
  };

  test("sends one RPC with the fixture, the request and the dry-run flag", async () => {
    const p = (await prepare()) as PreparedObservation;
    const c = client(async () => ({
      data: {
        observationId: 3,
        digest: "a".repeat(64),
        fullReady: true,
        simpleReady: true,
        created: true,
        latest: true,
        dryRun: true,
      },
      error: null,
    }));
    const result = await new SupabaseReconciledObservationGateway(c.client).record(
      FIXTURE,
      p.request as ReconciledObservationRequest,
      true,
    );
    expect(c.calls).toEqual([
      {
        fn: "service_record_reconciled_fantasy_observation",
        args: { p_fixture_id: FIXTURE, p_request: p.request, p_dry_run: true },
      },
    ]);
    expect(result).toMatchObject({ observationId: 3, dryRun: true, created: true });
  });

  test("a thrown fetch is a transient network error", async () => {
    const c = client(async () => {
      throw new Error("socket hang up");
    });
    const p = await prepare();
    await expect(
      new SupabaseReconciledObservationGateway(c.client).record(
        FIXTURE,
        p.request as ReconciledObservationRequest,
        false,
      ),
    ).rejects.toMatchObject({ code: "network_error", transient: true });
  });

  test("an answer of the wrong shape is not trusted", async () => {
    const c = client(async () => ({ data: { observationId: 1 }, error: null }));
    const p = await prepare();
    await expect(
      new SupabaseReconciledObservationGateway(c.client).record(
        FIXTURE,
        p.request as ReconciledObservationRequest,
        false,
      ),
    ).rejects.toMatchObject({ code: "response_invalid", transient: true });
  });
});

describe("classifyRpcError", () => {
  test("the database's refusal codes pass through, with a safe detail", () => {
    expect(
      classifyRpcError({
        message: "reconciled_identity_not_reviewed",
        code: "PT409",
        details: "sofascore:123",
      }),
    ).toMatchObject({
      code: "reconciled_identity_not_reviewed",
      transient: false,
      detail: "sofascore:123",
    });
    expect(classifyRpcError({ message: "adaptive_final_score_mismatch", code: "PT409" }).code).toBe(
      "adaptive_final_score_mismatch",
    );
    expect(classifyRpcError({ message: "forbidden", code: "PT403" }).code).toBe("forbidden");
  });
  test("busy or timed-out databases are transient", () => {
    for (const code of ["40001", "40P01", "57014", "08006", "53300"]) {
      expect(classifyRpcError({ message: "x", code }).transient).toBe(true);
    }
  });
  test("a missing function says the migration is not applied", () => {
    expect(
      classifyRpcError({ message: "Could not find the function", code: "PGRST202" }).code,
    ).toBe("function_missing");
  });
  test("anything else is reported without the raw message", () => {
    const e = classifyRpcError({ message: "relation secret_table does not exist", code: "42P01" });
    expect(e.code).toBe("database_error");
    expect(e.transient).toBe(false);
    expect(e.message).not.toContain("secret_table");
  });
});
