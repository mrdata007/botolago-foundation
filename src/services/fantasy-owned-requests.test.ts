import { afterAll, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { QueryClient, QueryObserver } from "@tanstack/react-query";

import type { FantasyHubDto, FantasyTeamDto } from "@/backend/fantasy/contracts";
import { mapFantasyError } from "@/backend/fantasy/errors";
import { SupabaseFantasyRepository } from "@/backend/fantasy/supabase-repository";
import {
  invalidateOwnedQueries,
  scopedFantasyKey,
  type FantasyKeyScope,
} from "./fantasy-data-source";
import { IntentKey } from "./fantasy-intent-key";
import { runOwnedMutation, type OwnedMutationContext } from "./fantasy-mutation-controller";
import { V2CloudFantasyRepository, type FantasySnapshot } from "./fantasy-owned-repository";
import { DEFAULT_STATE } from "./fantasy-state";

/**
 * How many requests each completed owned write costs, counted where they
 * leave the app: `SupabaseFantasyRepository`, one method per RPC (spied, as
 * in `fantasy-owned-step-up.test.ts`). Each write used to read `fantasy_hub`
 * before itself (for a team id the screen already held) and after itself,
 * and the snapshot it installed was then invalidated and read a third time.
 */

const SEASON = "00000000-0000-4000-8000-000000000001";
const GW = "00000000-0000-4000-8000-000000000102";
const NEXT_GW = "00000000-0000-4000-8000-000000000103";
const TEAM = "00000000-0000-4000-8000-000000000201";
const P1 = "00000000-0000-4000-8000-000000000301";
const P2 = "00000000-0000-4000-8000-000000000302";

function teamDto(version: number): FantasyTeamDto {
  return {
    id: TEAM,
    seasonId: SEASON,
    currentGameweekId: GW,
    name: "Atlas Eleven",
    bank: 1,
    teamValue: 100,
    freeTransfers: 1,
    version,
    status: "active",
    createdAt: "2026-09-01T00:00:00Z",
    updatedAt: "2026-09-20T00:00:00Z",
    squad: [],
    lineup: [],
    chips: { active: null, activeCancellable: false, used: [] },
  };
}

function hubWith(team: FantasyTeamDto | null): FantasyHubDto {
  return {
    season: { id: SEASON, name: "2026/2027", status: "active" },
    gameweek: {
      id: GW,
      sequence: 2,
      name: "2",
      deadlineAt: "2099-10-02T14:30:00Z",
      status: "open",
      pointsState: "provisional",
    },
    enrolmentGameweek: {
      id: NEXT_GW,
      sequence: 3,
      name: "3",
      deadlineAt: "2099-10-09T14:30:00Z",
      status: "scheduled",
    },
    team,
    rankingAvailable: true,
  } as FantasyHubDto;
}

/** Every request, in order: the RPC's repository method and its arguments. */
let requests: Array<{ rpc: string; args: unknown[] }> = [];
let hub: FantasyHubDto = hubWith(teamDto(3));
let confirmAnswer: unknown = null;
let failNext: unknown = null;

function record(rpc: string, answer: () => unknown) {
  return async (...args: unknown[]) => {
    requests.push({ rpc, args: args.slice(0, -1) }); // the context is last
    if (failNext) {
      const failure = failNext;
      failNext = null;
      throw mapFantasyError(failure);
    }
    return answer() as never;
  };
}

const spies = [
  spyOn(SupabaseFantasyRepository.prototype, "getHub").mockImplementation(
    record("fantasy_hub", () => hub),
  ),
  spyOn(SupabaseFantasyRepository.prototype, "createTeam").mockImplementation(
    record("create_fantasy_team", () => teamDto(1)),
  ),
  spyOn(SupabaseFantasyRepository.prototype, "saveLineup").mockImplementation(
    record("save_fantasy_lineup", () => teamDto(4)),
  ),
  spyOn(SupabaseFantasyRepository.prototype, "previewTransfers").mockImplementation(
    record("preview_fantasy_transfers", () => ({ transferCount: 1 })),
  ),
  spyOn(SupabaseFantasyRepository.prototype, "confirmTransfers").mockImplementation(
    record("confirm_fantasy_transfers", () => confirmAnswer),
  ),
  spyOn(SupabaseFantasyRepository.prototype, "activateChip").mockImplementation(
    record("activate_fantasy_chip", () => ({ chipType: "bench_boost", teamVersion: 4 })),
  ),
  spyOn(SupabaseFantasyRepository.prototype, "cancelChip").mockImplementation(
    record("cancel_fantasy_chip", () => ({ cancelled: true, teamVersion: 4 })),
  ),
];
afterAll(() => {
  for (const spy of spies) spy.mockRestore();
});

beforeEach(() => {
  requests = [];
  hub = hubWith(teamDto(3));
  confirmAnswer = {
    transferBatchId: "00000000-0000-4000-8000-000000000401",
    preview: { transferCount: 1 },
    team: teamDto(4),
  };
  failNext = null;
});

const rpcs = () => requests.map((request) => request.rpc);
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const squad = [
  { playerId: P1, slot: 1, isCaptain: true },
  { playerId: P2, slot: 12 },
];
const lineup = {
  teamName: "Atlas Eleven",
  managerName: null,
  formation: "4-4-2" as const,
  bank: 1,
  freeTransfers: 1,
  pendingTransfers: 0,
  squad,
  purchasePrices: {},
  expectedVersion: 3,
  currentGameweekId: GW,
  lifecycle: DEFAULT_STATE,
};
const transfers = [
  {
    outSourceId: P1,
    inSourceId: P2,
    priceOut: 5,
    priceIn: 5,
    cost: 0,
    hit: 0,
    chip: null,
  },
];
const confirmation = {
  teamId: TEAM,
  expectedVersion: 3,
  formation: "4-4-2" as const,
  bank: 1,
  freeTransfers: 0,
  pendingTransfers: 0,
  squad,
  purchasePrices: {},
  currentGameweekId: GW,
  lifecycle: DEFAULT_STATE,
  transfers,
};

describe("each owned write sends exactly the RPCs it needs", () => {
  const repo = () => new V2CloudFantasyRepository("user-1");

  it("a lineup save is one request, its answer the new snapshot", async () => {
    const snapshot = await repo().saveTeam({ ...lineup, teamId: TEAM, idempotencyKey: "k-1" });
    expect(requests).toEqual([
      {
        rpc: "save_fantasy_lineup",
        args: [
          TEAM,
          GW,
          [
            {
              fantasy_player_id: P1,
              slot: "starter",
              slot_order: 1,
              captain: true,
              vice_captain: false,
            },
            {
              fantasy_player_id: P2,
              slot: "bench",
              slot_order: 1,
              captain: false,
              vice_captain: false,
            },
          ],
          3,
          "k-1",
        ],
      },
    ]);
    expect({ teamId: snapshot.teamId, version: snapshot.version }).toEqual({
      teamId: TEAM,
      version: 4,
    });
  });

  it("a new team reads the hub for its season and gameweek, then is created: two", async () => {
    hub = hubWith(null);
    const snapshot = await repo().saveTeam({
      ...lineup,
      expectedVersion: 0,
      currentGameweekId: null,
    });
    expect(rpcs()).toEqual(["fantasy_hub", "create_fantasy_team"]);
    expect(requests[1]!.args[0]).toMatchObject({ seasonId: SEASON, gameweekId: NEXT_GW });
    expect(snapshot.version).toBe(1);
  });

  it("a transfer preview is one request, for the team on screen", async () => {
    await repo().previewTransfers({
      teamId: TEAM,
      expectedVersion: 3,
      currentGameweekId: GW,
      transfers,
      chip: null,
    });
    expect(requests).toEqual([
      {
        rpc: "preview_fantasy_transfers",
        args: [TEAM, GW, [{ player_out_id: P1, player_in_id: P2 }], 3, null],
      },
    ]);
  });

  it("a transfer confirmation is one request, the team it answers the snapshot", async () => {
    const snapshot = await repo().confirmTransfers({ ...confirmation, idempotencyKey: "k-2" });
    expect(requests).toEqual([
      {
        rpc: "confirm_fantasy_transfers",
        args: [TEAM, GW, [{ player_out_id: P1, player_in_id: P2 }], 3, "k-2", null],
      },
    ]);
    expect(snapshot.version).toBe(4);
  });

  it("a confirmation answered without a readable team reads the hub once more", async () => {
    confirmAnswer = { transferBatchId: "x" };
    hub = hubWith(teamDto(4));
    const snapshot = await repo().confirmTransfers(confirmation);
    expect(rpcs()).toEqual(["confirm_fantasy_transfers", "fantasy_hub"]);
    expect(snapshot.version).toBe(4);
  });

  it("a chip, activated or cancelled, is the RPC and one hub read", async () => {
    hub = hubWith(teamDto(4));
    await repo().activateChip({
      teamId: TEAM,
      gameweekId: GW,
      chip: "bench_boost",
      expectedVersion: 3,
      idempotencyKey: "k-3",
    });
    expect(requests).toEqual([
      { rpc: "activate_fantasy_chip", args: [TEAM, GW, "bench_boost", 3, "k-3"] },
      { rpc: "fantasy_hub", args: ["fr"] },
    ]);
    requests = [];
    await repo().cancelChip({ teamId: TEAM, gameweekId: GW, expectedVersion: 4 });
    expect(requests).toEqual([
      { rpc: "cancel_fantasy_chip", args: [TEAM, GW, 4] },
      { rpc: "fantasy_hub", args: ["fr"] },
    ]);
  });

  it("no team on screen: refused before any request", async () => {
    const refused = await repo()
      .cancelChip({ teamId: null, gameweekId: GW, expectedVersion: 3 })
      .catch((error: { code?: string }) => error.code);
    expect(refused).toBe("not_found");
    expect(requests).toEqual([]);
  });
});

describe("a completed write is not read back", () => {
  const scope: FantasyKeyScope = { source: "cloud", owner: "user-1" };
  const snapshotKey = scopedFantasyKey(scope, "snapshot");
  const pointsKey = scopedFantasyKey(scope, "gw-result", 2);

  it("the snapshot the write replaced is kept; other owned surfaces are asked again", async () => {
    const qc = new QueryClient();
    const reads = { snapshot: 0, points: 0 };
    // Both mounted, as on a screen: an invalidated one is read again at once.
    const observe = (key: readonly unknown[], counter: keyof typeof reads) =>
      new QueryObserver(qc, {
        queryKey: key,
        queryFn: async () => {
          reads[counter] += 1;
          return counter === "snapshot" ? ({ version: 3 } as FantasySnapshot) : 10;
        },
        staleTime: Infinity,
      }).subscribe(() => {});
    const stop = [observe(snapshotKey, "snapshot"), observe(pointsKey, "points")];
    await settle();
    expect(reads).toEqual({ snapshot: 1, points: 1 });

    const ctx: OwnedMutationContext = {
      qc,
      scope,
      setMutationStatus: () => {},
      replaceSnapshot: (next) => void qc.setQueryData(snapshotKey, next),
      invalidateOwned: (options) => void invalidateOwnedQueries(qc, snapshotKey, options),
    };
    const repo = new V2CloudFantasyRepository("user-1");
    const result = await runOwnedMutation(ctx, {
      action: () => repo.saveTeam({ ...lineup, teamId: TEAM }),
      args: undefined,
    });
    await settle();
    expect(result.ok).toBe(true);
    expect(rpcs()).toEqual(["save_fantasy_lineup"]);
    expect((qc.getQueryData(snapshotKey) as FantasySnapshot).version).toBe(4);
    // The snapshot is not read again; the points are.
    expect(reads).toEqual({ snapshot: 1, points: 2 });
    for (const unsubscribe of stop) unsubscribe();
    qc.clear();
  });

  it("without a replaced snapshot, everything owned is invalidated as before", async () => {
    const qc = new QueryClient();
    qc.setQueryData(snapshotKey, { version: 3 });
    qc.setQueryData(pointsKey, 10);
    qc.setQueryData(["football", "clubs", "fr"], []);
    await invalidateOwnedQueries(qc, snapshotKey);
    expect(qc.getQueryState(snapshotKey)?.isInvalidated).toBe(true);
    expect(qc.getQueryState(pointsKey)?.isInvalidated).toBe(true);
    expect(qc.getQueryState(["football", "clubs", "fr"])?.isInvalidated).toBe(false);
    qc.clear();
  });
});

describe("one idempotency key per intent", () => {
  it("the same intent keeps its key; a changed one, or a success, starts another", () => {
    let minted = 0;
    const keys = new IntentKey(() => `key-${++minted}`);
    const intent = [TEAM, 3, GW, squad];
    expect(keys.for(intent)).toBe("key-1");
    expect(keys.for([TEAM, 3, GW, squad.map((player) => ({ ...player }))])).toBe("key-1");
    expect(keys.for([TEAM, 3, GW, [...squad].reverse()])).toBe("key-2");
    expect(keys.for([TEAM, 4, GW, [...squad].reverse()])).toBe("key-3");
    keys.clear();
    expect(keys.for([TEAM, 4, GW, [...squad].reverse()])).toBe("key-4");
  });

  it("a save retried after a lost answer goes out under the key it went out with", async () => {
    const keys = new IntentKey();
    const repo = new V2CloudFantasyRepository("user-1");
    const save = () =>
      repo.saveTeam({ ...lineup, teamId: TEAM, idempotencyKey: keys.for([TEAM, 3, GW, squad]) });

    failNext = { code: "", message: "TypeError: Failed to fetch", details: "", hint: "" };
    const lost = await save().catch((error: { code?: string }) => error.code);
    expect(lost).toBe("network");
    await save();
    const [first, retry] = requests;
    expect(retry!.args[4]).toBe(first!.args[4]);

    // The next lineup, after that success, is a new intent.
    keys.clear();
    await save();
    expect(requests[2]!.args[4]).not.toBe(first!.args[4]);
  });

  it("a confirmation and a chip carry the screen's key as sent", async () => {
    const repo = new V2CloudFantasyRepository("user-1");
    await repo.confirmTransfers({ ...confirmation, idempotencyKey: "intent-confirm" });
    await repo.activateChip({
      teamId: TEAM,
      gameweekId: GW,
      chip: "wildcard",
      expectedVersion: 4,
      idempotencyKey: "intent-chip",
    });
    expect(requests[0]!.args[4]).toBe("intent-confirm");
    expect(requests[1]!.args[4]).toBe("intent-chip");
  });
});
