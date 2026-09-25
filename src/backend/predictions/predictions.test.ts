import { describe, expect, it } from "bun:test";

import {
  claimGuestPredictionsResponseSchema,
  leaderboardResponseSchema,
  myPredictionsResponseSchema,
  predictionsRoundResponseSchema,
  savePredictionsResponseSchema,
  type SavePredictionsDto,
} from "./contracts";
import { mapPredictionsError, PredictionsError } from "./errors";
import {
  GuestPredictionStore,
  GUEST_STORE_MAX_ITEMS,
  type GuestPrediction,
  type KeyValueStorage,
} from "./guest-store";
import { MockPredictionsRepository, MOCK_INVITE_CODE } from "./mock-repository";
import { PredictionSaveQueue, type SaveQueueState, type SaveQueueTimers } from "./save-queue";
import { guestPickScore, matchOutcome, predictionPoints, predictionResultKind } from "./scoring";
import { SCORING_CASES } from "./scoring-cases";

const SEASON = "00000050-0000-4000-8000-000000000001";
const id = (n: number) => `a7000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const team = (n: number) => `b7000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

// ---------------------------------------------------------------------------
// Rule v1
// ---------------------------------------------------------------------------

describe("the TypeScript scorer", () => {
  it.each(SCORING_CASES.map((c) => [c] as const))("scores %o like the database", (c) => {
    expect(predictionPoints(c.prediction, c.result)).toBe(c.points);
    expect(predictionResultKind(c.prediction, c.result)).toBe(c.kind);
  });

  it("names the outcome", () => {
    expect(matchOutcome({ home: 2, away: 1 })).toBe("home");
    expect(matchOutcome({ home: 1, away: 1 })).toBe("draw");
    expect(matchOutcome({ home: 0, away: 3 })).toBe("away");
  });

  it("keeps the same cases as the database test", async () => {
    const sql = await Bun.file(
      new URL("../../../supabase/tests/database/predictions_rules.test.sql", import.meta.url),
    ).text();
    for (const c of SCORING_CASES)
      expect(sql).toContain(
        `app_private.prediction_points(${c.prediction.home}, ${c.prediction.away}, ${c.result.home}, ${c.result.away}), ${c.points},`,
      );
  });
});

describe("guestPickScore: a guest's pick, scored like a signed-in player's", () => {
  const pick = { home: 2, away: 1 };
  const final = { final: true, void: false, result: { home: 2, away: 1 } };

  it("scores a final match", () => {
    expect(guestPickScore(pick, final)).toEqual({ points: 3, kind: "exact" });
    expect(guestPickScore({ home: 1, away: 0 }, final)).toEqual({ points: 1, kind: "outcome" });
  });

  it("waits for the final", () => {
    expect(guestPickScore(pick, { final: false, void: false, result: null })).toBeNull();
    expect(guestPickScore(pick, { ...final, final: false })).toBeNull();
  });

  it("scores a void match as void for 0, whatever its result says", () => {
    // An operator can void a finished match: it keeps final and a result.
    expect(guestPickScore(pick, { ...final, void: true })).toEqual({ points: 0, kind: "void" });
    expect(guestPickScore(pick, { final: false, void: true, result: null })).toEqual({
      points: 0,
      kind: "void",
    });
  });

  it("has nothing to score without a pick", () => {
    expect(guestPickScore(null, final)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Contracts: the shapes the SQL builds
// ---------------------------------------------------------------------------

const teamJson = (n: number) => ({
  id: team(n),
  slug: `club-${n}`,
  name: `Club ${n}`,
  shortName: `C${n}`,
  code: `C${n}`,
  city: null,
  countryCode: "MA",
  crestUrl: null,
  crestPath: null,
  primaryColor: null,
  secondaryColor: null,
  active: true,
});

describe("the Pronostics contracts", () => {
  it("reads a closed journée: nothing but the switch", () => {
    const parsed = predictionsRoundResponseSchema.parse({
      schemaVersion: 1,
      mode: "off",
      allowed: false,
      serverTime: "2026-09-24T20:00:00.123456+00:00",
    });
    expect(parsed.allowed).toBe(false);
  });

  it("reads an open journée as the database builds it", () => {
    const parsed = predictionsRoundResponseSchema.parse({
      schemaVersion: 1,
      mode: "public",
      allowed: true,
      serverTime: "2026-09-24T20:00:00.123456+00:00",
      season: { id: SEASON, label: "2026/27" },
      round: {
        id: id(1),
        number: 1,
        name: "Journée 1",
        state: "in_progress",
        provisional: true,
        nextLockAt: "2026-09-25T19:00:00+00:00",
        scoringVersion: 0,
      },
      rounds: [{ number: 1, state: "in_progress" }],
      fixtures: [
        {
          id: id(10),
          kickoffAt: "2026-09-24T15:00:00+00:00",
          kickoffConfirmed: true,
          status: "postponed",
          open: false,
          home: teamJson(1),
          away: teamJson(2),
          live: null,
          result: null,
          final: false,
          void: false,
          corrected: false,
        },
      ],
    });
    expect(parsed.allowed && parsed.fixtures[0]?.status).toBe("postponed");
  });

  it("refuses a score where the database promises none", () => {
    expect(() =>
      myPredictionsResponseSchema.parse({
        serverTime: "2026-09-24T20:00:00+00:00",
        items: [
          {
            fixtureId: id(10),
            home: 21,
            away: 0,
            submittedAt: "2026-09-24T19:00:00+00:00",
            points: null,
            resultKind: null,
          },
        ],
        summary: null,
      }),
    ).toThrow();
  });

  it("reads save, import and ranking answers", () => {
    expect(
      savePredictionsResponseSchema.parse({
        serverTime: "2026-09-24T20:00:00+00:00",
        results: [
          { fixtureId: id(10), status: "locked", home: null, away: null, submittedAt: null },
        ],
      }).results[0]?.status,
    ).toBe("locked");
    expect(
      claimGuestPredictionsResponseSchema.parse({
        serverTime: "2026-09-24T20:00:00+00:00",
        imported: 1,
        keptExisting: 0,
        started: 0,
        invalid: 0,
        results: [{ fixtureId: id(10), status: "imported" }],
      }).imported,
    ).toBe(1);
    const empty = leaderboardResponseSchema.parse({
      allowed: true,
      scope: "round",
      items: [],
      total: 0,
      nextCursor: null,
      me: null,
    });
    expect(empty.allowed).toBe(true);
    expect(leaderboardResponseSchema.parse({ allowed: false, mode: "testers" }).allowed).toBe(
      false,
    );
  });
});

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

describe("mapPredictionsError", () => {
  it("maps a raised message exactly", () => {
    expect(mapPredictionsError({ message: "account_banned", code: "PT403" }).code).toBe(
      "account_banned",
    );
    expect(mapPredictionsError({ message: "league_full", code: "PT409" }).code).toBe("league_full");
  });

  it("never matches a code hidden inside other text", () => {
    // The Fantasy mapper's substring search picks the first code it sees.
    expect(mapPredictionsError({ message: "league_access_denied then account_banned" }).code).toBe(
      "data_unavailable",
    );
  });

  it("recognises a network failure and only that as retryable", () => {
    const offline = mapPredictionsError(new TypeError("Failed to fetch"));
    expect(offline.code).toBe("network");
    expect(offline.retryable).toBe(true);
    expect(mapPredictionsError({ message: "TypeError: Failed to fetch" }).code).toBe("network");
    expect(mapPredictionsError({ message: "predictions_unavailable" }).retryable).toBe(false);
  });

  it("reads a database the migrations have not reached as switched off", () => {
    expect(
      mapPredictionsError({ code: "PGRST202", message: "Could not find the function" }).code,
    ).toBe("predictions_unavailable");
  });

  it("keeps an error it already mapped", () => {
    const error = new PredictionsError("league_full", "league_full");
    expect(mapPredictionsError(error)).toBe(error);
  });
});

// ---------------------------------------------------------------------------
// Guest store
// ---------------------------------------------------------------------------

function memoryStorage(): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
}

const pick = (n: number, overrides: Partial<GuestPrediction> = {}): GuestPrediction => ({
  fixtureId: id(n),
  home: 1,
  away: 0,
  homeTeamId: team(1),
  awayTeamId: team(2),
  roundNumber: 1,
  kickoffAt: new Date(Date.UTC(2026, 8, 25, 18, 0) + n * 3_600_000).toISOString(),
  savedAt: "2026-09-24T12:00:00.000Z",
  ...overrides,
});

describe("the guest store", () => {
  it("keeps picks on the phone, one per match", () => {
    const store = new GuestPredictionStore(memoryStorage());
    store.upsert(SEASON, pick(1));
    store.upsert(SEASON, pick(1, { home: 3 }));
    store.upsert(SEASON, pick(2));
    expect(Object.keys(store.read().predictions)).toHaveLength(2);
    expect(store.get(id(1))?.home).toBe(3);
    expect(store.persistent).toBe(true);
  });

  it("falls back to memory for the visit when storage is blocked", () => {
    const store = new GuestPredictionStore(null);
    expect(store.persistent).toBe(false);
    store.upsert(SEASON, pick(1));
    expect(store.get(id(1))).not.toBeNull();
  });

  it("starts over on corrupt data or an unknown version", () => {
    const storage = memoryStorage();
    storage.setItem("botolago.predictions.guest.v1", "{not json");
    expect(new GuestPredictionStore(storage).read().predictions).toEqual({});
    storage.setItem("botolago.predictions.guest.v1", JSON.stringify({ version: 2 }));
    expect(new GuestPredictionStore(storage).read().version).toBe(1);
  });

  it("drops another season's picks instead of importing them", () => {
    const store = new GuestPredictionStore(memoryStorage());
    store.upsert(SEASON, pick(1));
    store.upsert(id(999), pick(2));
    expect(Object.keys(store.read().predictions)).toEqual([id(2)]);
    expect(store.forClaim(SEASON)).toEqual([]);
  });

  it("sends at most forty picks, latest matches first, with their teams", () => {
    const store = new GuestPredictionStore(memoryStorage());
    for (let n = 1; n <= 45; n += 1) store.upsert(SEASON, pick(n));
    const claim = store.forClaim(SEASON);
    expect(claim).toHaveLength(40);
    expect(claim[0]?.fixtureId).toBe(id(45));
    expect(claim[0]).toEqual({
      fixtureId: id(45),
      home: 1,
      away: 0,
      homeTeamId: team(1),
      awayTeamId: team(2),
    });
  });

  it("keeps only what the account did not take, marked not counted", () => {
    const store = new GuestPredictionStore(memoryStorage());
    [1, 2, 3, 4].forEach((n) => store.upsert(SEASON, pick(n)));
    store.applyClaim([
      { fixtureId: id(1), status: "imported" },
      { fixtureId: id(2), status: "kept" },
      { fixtureId: id(3), status: "started" },
      { fixtureId: id(4), status: "invalid" },
    ]);
    const state = store.read();
    expect(Object.keys(state.predictions)).toEqual([id(3)]);
    expect(state.notCounted).toEqual([id(3)]);
    expect(store.forClaim(SEASON)).toEqual([]);
  });

  it("remembers each journée started and completed once", () => {
    const store = new GuestPredictionStore(memoryStorage());
    expect(store.markRoundStarted(SEASON, 6)).toBe(true);
    expect(store.markRoundStarted(SEASON, 6)).toBe(false);
    expect(store.hasStartedRound(SEASON, 6)).toBe(true);
    expect(store.markRoundCompleted(SEASON, 6)).toBe(true);
    expect(store.markRoundCompleted(SEASON, 6)).toBe(false);
  });

  it("prunes the oldest matches beyond its cap", () => {
    const store = new GuestPredictionStore(memoryStorage());
    for (let n = 1; n <= GUEST_STORE_MAX_ITEMS + 5; n += 1) store.upsert(SEASON, pick(n));
    const ids = Object.keys(store.read().predictions);
    expect(ids).toHaveLength(GUEST_STORE_MAX_ITEMS);
    expect(ids).not.toContain(id(1));
  });
});

// ---------------------------------------------------------------------------
// Save queue
// ---------------------------------------------------------------------------

function fakeTimers(): SaveQueueTimers & { advance(ms: number): void; pending(): number } {
  let clock = 0;
  let next = 1;
  const tasks = new Map<number, { at: number; run: () => void }>();
  return {
    setTimeout(handler, ms) {
      const handle = next++;
      tasks.set(handle, { at: clock + ms, run: handler });
      return handle;
    },
    clearTimeout(handle) {
      tasks.delete(handle as number);
    },
    advance(ms) {
      clock += ms;
      for (const [handle, task] of [...tasks].sort((a, b) => a[1].at - b[1].at)) {
        if (task.at <= clock) {
          tasks.delete(handle);
          task.run();
        }
      }
    },
    pending: () => tasks.size,
  };
}

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

function answer(
  items: readonly { fixtureId: string; home: number; away: number }[],
  locked: string[] = [],
): SavePredictionsDto {
  return {
    serverTime: "2026-09-24T20:00:00+00:00",
    results: items.map((item) => ({
      fixtureId: item.fixtureId,
      status: locked.includes(item.fixtureId) ? "locked" : "saved",
      home: locked.includes(item.fixtureId) ? null : item.home,
      away: locked.includes(item.fixtureId) ? null : item.away,
      submittedAt: locked.includes(item.fixtureId) ? null : "2026-09-24T20:00:00+00:00",
    })),
  };
}

describe("the save queue", () => {
  it("waits a second after the last tap, then sends every change in one call", async () => {
    const timers = fakeTimers();
    const sent: unknown[][] = [];
    const queue = new PredictionSaveQueue({
      timers,
      send: async (items) => {
        sent.push([...items]);
        return answer(items);
      },
    });
    queue.set({ fixtureId: id(1), home: 1, away: 0 });
    timers.advance(600);
    queue.set({ fixtureId: id(1), home: 2, away: 0 });
    queue.set({ fixtureId: id(2), home: 0, away: 0 });
    timers.advance(999);
    expect(sent).toHaveLength(0);
    timers.advance(1);
    await flushPromises();
    expect(sent).toEqual([
      [
        { fixtureId: id(1), home: 2, away: 0 },
        { fixtureId: id(2), home: 0, away: 0 },
      ],
    ]);
    expect(queue.state).toBe("saved");
    expect(queue.pendingIds).toEqual([]);
  });

  it("sends one request at a time, and a change made meanwhile goes next", async () => {
    const timers = fakeTimers();
    const sent: unknown[][] = [];
    let release: () => void = () => {};
    const queue = new PredictionSaveQueue({
      timers,
      send: (items) => {
        sent.push([...items]);
        return new Promise((resolve) => {
          release = () => resolve(answer(items));
        });
      },
    });
    queue.set({ fixtureId: id(1), home: 1, away: 0 });
    timers.advance(1000);
    queue.set({ fixtureId: id(1), home: 4, away: 0 });
    timers.advance(1000);
    expect(sent).toHaveLength(1);
    release();
    await flushPromises();
    // The first answer confirmed 1-0, but 4-0 is newer: it stays queued.
    expect(queue.pendingValue(id(1))).toEqual({ home: 4, away: 0 });
    timers.advance(0);
    await flushPromises();
    expect(sent).toHaveLength(2);
    expect(sent[1]).toEqual([{ fixtureId: id(1), home: 4, away: 0 }]);
    release();
    await flushPromises();
    expect(queue.state).toBe("saved");
  });

  it("sends at once when the match is about to lock", async () => {
    const timers = fakeTimers();
    const sent: unknown[][] = [];
    const now = Date.parse("2026-09-24T19:59:00Z");
    const queue = new PredictionSaveQueue({
      timers,
      now: () => now,
      send: async (items) => {
        sent.push([...items]);
        return answer(items);
      },
    });
    queue.set({ fixtureId: id(1), home: 1, away: 1, kickoffAt: "2026-09-24T20:00:00Z" });
    timers.advance(0);
    await flushPromises();
    expect(sent).toHaveLength(1);
  });

  it("drops a match the database locked and reports it", async () => {
    const timers = fakeTimers();
    const locked: string[] = [];
    const queue = new PredictionSaveQueue({
      timers,
      send: async (items) => answer(items, [id(2)]),
      onLocked: (results) => locked.push(...results.map((result) => result.fixtureId)),
    });
    queue.set({ fixtureId: id(1), home: 1, away: 0 });
    queue.set({ fixtureId: id(2), home: 1, away: 0 });
    await queue.flush();
    expect(locked).toEqual([id(2)]);
    expect(queue.pendingIds).toEqual([]);
  });

  it("retries a network failure and says it is offline meanwhile", async () => {
    const timers = fakeTimers();
    const states: SaveQueueState[] = [];
    let attempts = 0;
    const queue = new PredictionSaveQueue({
      timers,
      onStateChange: (state) => states.push(state),
      send: async (items) => {
        attempts += 1;
        if (attempts === 1) throw new TypeError("Failed to fetch");
        return answer(items);
      },
    });
    queue.set({ fixtureId: id(1), home: 1, away: 0 });
    await queue.flush();
    expect(queue.state).toBe("offline");
    expect(queue.pendingIds).toEqual([id(1)]);
    timers.advance(3_000);
    await flushPromises();
    await flushPromises();
    expect(attempts).toBe(2);
    expect(queue.state).toBe("saved");
    expect(states).toContain("offline");
  });

  it("stops on a refusal that retrying cannot fix, keeping the changes", async () => {
    const timers = fakeTimers();
    const queue = new PredictionSaveQueue({
      timers,
      send: async () => {
        throw { message: "predictions_unavailable", code: "PT403" };
      },
    });
    queue.set({ fixtureId: id(1), home: 1, away: 0 });
    await queue.flush();
    expect(queue.state).toBe("error");
    expect(timers.pending()).toBe(0);
    expect(queue.pendingIds).toEqual([id(1)]);
  });

  it("keeps unsent changes as a draft and sends them on the next visit", async () => {
    const timers = fakeTimers();
    let draft: readonly { fixtureId: string; home: number; away: number }[] = [];
    const drafts = { load: () => draft, save: (items: typeof draft) => void (draft = items) };
    const first = new PredictionSaveQueue({ timers, drafts, send: async (items) => answer(items) });
    first.set({ fixtureId: id(1), home: 2, away: 2 });
    first.dispose();
    expect(draft).toEqual([{ fixtureId: id(1), home: 2, away: 2 }]);

    const sent: unknown[][] = [];
    new PredictionSaveQueue({
      timers,
      drafts,
      send: async (items) => {
        sent.push([...items]);
        return answer(items);
      },
    });
    timers.advance(0);
    await flushPromises();
    expect(sent).toEqual([[{ fixtureId: id(1), home: 2, away: 2 }]]);
    expect(draft).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Mock repository: the same rules as the database
// ---------------------------------------------------------------------------

describe("the mock repository", () => {
  const signedIn = { actorId: "usr_mock_player", requestId: "request" };
  const visitor = { actorId: null, requestId: "request" };

  it("opens on the journée with the next open match and locks what has started", async () => {
    const repository = new MockPredictionsRepository();
    const round = await repository.getRound({ roundNumber: null, language: "fr" }, visitor);
    if (!round.allowed || !round.round) throw new Error("expected an open journée");
    expect(round.round.number).toBe(14);
    const opens = round.fixtures.map((fixture) => fixture.open);
    expect(opens[0]).toBe(false);
    expect(opens.slice(1).every(Boolean)).toBe(true);
  });

  it("saves open matches only, and refuses a visitor", async () => {
    const repository = new MockPredictionsRepository();
    const round = await repository.getRound({ roundNumber: 14, language: "fr" }, signedIn);
    if (!round.allowed) throw new Error("expected an open journée");
    const [live, open] = round.fixtures;
    const saved = await repository.savePredictions(
      [
        { fixtureId: live!.id, home: 1, away: 0 },
        { fixtureId: open!.id, home: 2, away: 1 },
      ],
      signedIn,
    );
    expect(saved.results.map((result) => result.status)).toEqual(["locked", "saved"]);
    await expect(
      repository.savePredictions([{ fixtureId: open!.id, home: 2, away: 1 }], visitor),
    ).rejects.toMatchObject({ code: "predictions_unauthenticated" });
  });

  it("pages the ranking with the database's cursor contract", async () => {
    const repository = new MockPredictionsRepository();
    const first = await repository.getLeaderboard(
      { scope: "season", roundNumber: null, cursor: null, limit: 20 },
      visitor,
    );
    if (!first.allowed) throw new Error("expected a ranking");
    expect(first.items).toHaveLength(20);
    expect(first.items.every((item) => /^.\*\*\*.?$/.test(item.name ?? ""))).toBe(true);
    const second = await repository.getLeaderboard(
      { scope: "season", roundNumber: null, cursor: first.nextCursor, limit: 100 },
      visitor,
    );
    if (!second.allowed) throw new Error("expected a ranking");
    expect(second.total).toBeNull();
    expect(second.nextCursor).toBeNull();
  });

  it("joins with a typed code, refuses a wrong one the same way", async () => {
    const repository = new MockPredictionsRepository();
    const typed = `${MOCK_INVITE_CODE.slice(0, 8).toLowerCase()} - ${MOCK_INVITE_CODE.slice(8)}`;
    const joined = await repository.joinLeague(typed, signedIn);
    expect(joined.joined).toBe(true);
    expect((await repository.joinLeague(MOCK_INVITE_CODE, signedIn)).joined).toBe(false);
    await expect(repository.joinLeague("nope", signedIn)).rejects.toMatchObject({
      code: "invite_code_invalid",
    });
    await expect(repository.leaveLeague(joined.leagueId, signedIn)).resolves.toMatchObject({
      left: true,
    });
  });

  it("creates a league with a fresh code; the owner cannot leave it", async () => {
    const repository = new MockPredictionsRepository();
    const created = await repository.createLeague("Les Amis", signedIn);
    expect(created.inviteCode).toMatch(/^[0-9A-F]{32}$/);
    await expect(repository.leaveLeague(created.leagueId, signedIn)).rejects.toBeInstanceOf(
      PredictionsError,
    );
    await expect(repository.createLeague(" x", signedIn)).rejects.toMatchObject({
      code: "validation_failed",
    });
  });
});
