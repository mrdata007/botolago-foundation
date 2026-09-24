import { describe, expect, test } from "bun:test";
import type { MatchEvent } from "@/services/match-live";
import {
  dismissGoalMoment,
  eventsWhenFresh,
  goalToCelebrate,
  initialGoalMomentState,
  matchRefetchInterval,
  scoreCountsEveryGoal,
  stepGoalMoment,
  trackArrivals,
  type GoalMomentState,
} from "./goal-moment";

function event(
  id: string,
  type: MatchEvent["type"],
  overrides: Partial<MatchEvent> = {},
): MatchEvent {
  return {
    id,
    type,
    detail: null,
    teamId: "home-club",
    playerId: null,
    relatedPlayerId: null,
    minute: 60,
    addedTime: 0,
    sequence: 1,
    period: "second_half",
    side: "home",
    clubId: "home-club",
    ...overrides,
  };
}

const LIVE = { status: "live" as const, minute: 63 };

const atLoad = [event("goal-12", "goal", { minute: 12 }), event("card-33", "yellow_card")];

/** Feed a sequence of refreshes through the rule, as the page's renders would. */
function run(
  refreshes: ReadonlyArray<readonly MatchEvent[] | undefined>,
  {
    matchId = "match-1",
    match = LIVE,
  }: { matchId?: string; match?: { status: "live" | "finished"; minute?: number } } = {},
) {
  let state: GoalMomentState = initialGoalMomentState(matchId, undefined);
  const shown: (string | null)[] = [];
  for (const events of refreshes) {
    state = stepGoalMoment(state, { matchId, events, match });
    shown.push(state.goal?.id ?? null);
  }
  return { state, shown };
}

describe("goal moment trigger", () => {
  test("never fires for goals already present when the page loads", () => {
    // Seeded at mount (the server payload) and seeded on first data (a loading
    // query): both see the 12th-minute goal as history.
    expect(initialGoalMomentState("match-1", atLoad).goal).toBeNull();
    expect(run([undefined, atLoad, atLoad]).shown).toEqual([null, null, null]);
  });

  test("fires once for a new goal id, and not again on the next refresh", () => {
    const goal = event("goal-71", "goal", { minute: 61 });
    const { shown, state } = run([atLoad, [...atLoad, goal], [...atLoad, goal]]);
    expect(shown).toEqual([null, "goal-71", "goal-71"]);

    // Once put away it stays away: the id is remembered.
    const dismissed = dismissGoalMoment(state);
    expect(dismissed.goal).toBeNull();
    const again = stepGoalMoment(dismissed, {
      matchId: "match-1",
      events: [...atLoad, goal],
      match: LIVE,
    });
    expect(again.goal).toBeNull();
    expect(again).toBe(dismissed);
  });

  test("penalties and own goals count; cards, substitutions and the rest do not", () => {
    for (const type of ["penalty_goal", "own_goal"] as const) {
      expect(run([atLoad, [...atLoad, event(`new-${type}`, type)]]).shown.at(-1)).toBe(
        `new-${type}`,
      );
    }
    for (const type of [
      "yellow_card",
      "second_yellow",
      "red_card",
      "substitution",
      "missed_penalty",
      "var",
      "injury",
      "period_start",
      "period_end",
    ] as const) {
      expect(run([atLoad, [...atLoad, event(`new-${type}`, type)]]).shown.at(-1)).toBeNull();
    }
  });

  test("a goal with no team is not celebrated: there is no club colour to paint", () => {
    const orphan = event("goal-x", "goal", { side: null, clubId: null, teamId: null });
    expect(run([atLoad, [...atLoad, orphan]]).shown.at(-1)).toBeNull();
  });

  test("only while the match is live", () => {
    const goal = event("goal-late", "goal");
    const { shown } = run([atLoad, [...atLoad, goal]], {
      match: { status: "finished", minute: 90 },
    });
    expect(shown).toEqual([null, null]);
  });

  test("a language switch (undefined data, then the same ids) changes nothing", () => {
    const { shown, state } = run([atLoad, undefined, atLoad]);
    expect(shown).toEqual([null, null, null]);
    expect([...(state.seen ?? [])].sort()).toEqual(["card-33", "goal-12"]);
  });

  test("several goals in one refresh: only the newest is shown", () => {
    const first = event("goal-58", "goal", { minute: 58 });
    const second = event("goal-61", "goal", { minute: 61, side: "away", clubId: "away-club" });
    const stoppage = event("goal-61b", "goal", { minute: 61, sequence: 2 });
    expect(run([atLoad, [...atLoad, second, first]]).shown.at(-1)).toBe("goal-61");
    expect(run([atLoad, [...atLoad, second, stoppage, first]]).shown.at(-1)).toBe("goal-61b");
  });

  test("a new goal replaces the one on screen; a card arriving meanwhile does not", () => {
    const first = event("goal-58", "goal", { minute: 58 });
    const card = event("card-59", "yellow_card", { minute: 59 });
    const second = event("goal-62", "goal", { minute: 62 });
    const { shown } = run([
      atLoad,
      [...atLoad, first],
      [...atLoad, first, card],
      [...atLoad, first, card, second],
    ]);
    expect(shown).toEqual([null, "goal-58", "goal-58", "goal-62"]);
  });

  test("a goal far behind the match clock is a backfill, not a moment", () => {
    const backfill = event("goal-40", "goal", { minute: 40 });
    const fresh = event("goal-55", "goal", { minute: 55 });
    expect(run([atLoad, [...atLoad, backfill]]).shown.at(-1)).toBeNull();
    expect(run([atLoad, [...atLoad, fresh]]).shown.at(-1)).toBe("goal-55");
    // No clock known: nothing to measure the lag against.
    expect(run([atLoad, [...atLoad, backfill]], { match: { status: "live" } }).shown.at(-1)).toBe(
      "goal-40",
    );
  });

  test("another match starts from nothing: its goals at load are history too", () => {
    const goal = event("goal-71", "goal", { minute: 61 });
    let state = initialGoalMomentState("match-1", atLoad);
    state = stepGoalMoment(state, {
      matchId: "match-1",
      events: [...atLoad, goal],
      match: LIVE,
    });
    expect(state.goal?.id).toBe("goal-71");

    // The H2H list navigates to another fixture in the same component.
    const other = [event("other-goal", "goal", { minute: 20 })];
    state = stepGoalMoment(state, { matchId: "match-2", events: undefined, match: undefined });
    expect(state.goal).toBeNull();
    expect(state.seen).toBeNull();
    state = stepGoalMoment(state, { matchId: "match-2", events: other, match: LIVE });
    expect(state.goal).toBeNull();
  });

  test("returns the same state object when nothing changed, so a render costs no update", () => {
    const seeded = initialGoalMomentState("match-1", atLoad);
    expect(stepGoalMoment(seeded, { matchId: "match-1", events: atLoad, match: LIVE })).toBe(
      seeded,
    );
    expect(stepGoalMoment(seeded, { matchId: "match-1", events: undefined, match: LIVE })).toBe(
      seeded,
    );
  });
});

describe("trackArrivals", () => {
  test("seeds from the first defined list without arrivals, then reports only new ids", () => {
    const first = trackArrivals(null, [{ id: "a" }, { id: "b" }]);
    expect(first.arrived).toEqual([]);
    const second = trackArrivals(first.seen, [{ id: "a" }, { id: "b" }, { id: "c" }]);
    expect(second.arrived).toEqual([{ id: "c" }]);
    expect(trackArrivals(second.seen, [{ id: "c" }]).seen).toBe(second.seen);
  });

  test("undefined events leave an unseeded tracker unseeded", () => {
    expect(trackArrivals(null, undefined)).toEqual({ seen: null, arrived: [] });
  });
});

describe("goalToCelebrate", () => {
  test("needs a match", () => {
    expect(goalToCelebrate([event("g", "goal")], undefined)).toBeNull();
  });
});

describe("coming back to a match page", () => {
  // The reader left at 62′ with 1–0 and comes back at 65′: the query first
  // hands over the copy it cached then (stale, refetching), then the fresh
  // list with the 64′ goal they missed.
  const cached = [event("goal-12", "goal", { minute: 12 })];
  const fresh = [...cached, event("goal-64", "goal", { minute: 64 })];
  const stale = { isStale: true, isFetching: true };
  const settled = { isStale: false, isFetching: false };

  test("the stale copy in flight is withheld, so the goal scored meanwhile is history", () => {
    const { shown } = run([eventsWhenFresh(stale, cached), eventsWhenFresh(settled, fresh)], {
      match: { status: "live", minute: 65 },
    });
    expect(shown).toEqual([null, null]);
  });

  test("seeding from the stale copy is exactly what used to replay it", () => {
    const { shown } = run([cached, fresh], { match: { status: "live", minute: 65 } });
    expect(shown).toEqual([null, "goal-64"]);
  });

  test("a live refresh only pauses the rule: the next goal still plays", () => {
    const next = [...fresh, event("goal-70", "goal", { minute: 70 })];
    const { shown } = run(
      [
        eventsWhenFresh(settled, fresh),
        eventsWhenFresh({ isStale: true, isFetching: true }, fresh),
        eventsWhenFresh(settled, next),
      ],
      { match: { status: "live", minute: 70 } },
    );
    expect(shown).toEqual([null, null, "goal-70"]);
  });
});

describe("scoreCountsEveryGoal", () => {
  const goals = [
    event("g1", "goal"),
    event("c1", "yellow_card"),
    event("g2", "own_goal"),
    event("g3", "penalty_goal"),
  ];

  test("true once the score has caught up with the goals on the sheet", () => {
    expect(scoreCountsEveryGoal({ homeScore: 2, awayScore: 1 }, goals)).toBe(true);
  });

  test("false while a goal event is ahead of the score, so no pre-goal score is shown", () => {
    expect(scoreCountsEveryGoal({ homeScore: 1, awayScore: 1 }, goals)).toBe(false);
    expect(scoreCountsEveryGoal({}, [event("g1", "goal")])).toBe(false);
  });
});

describe("matchRefetchInterval", () => {
  const kickoff = "2026-09-24T19:00:00Z";
  const at = (iso: string) => Date.parse(iso);

  test("every 30 seconds while live", () => {
    expect(matchRefetchInterval({ status: "live", kickoff }, at(kickoff))).toBe(30_000);
  });

  test("every minute from 15 minutes before a scheduled kick-off", () => {
    expect(matchRefetchInterval({ status: "scheduled", kickoff }, at("2026-09-24T18:44:00Z"))).toBe(
      false,
    );
    expect(matchRefetchInterval({ status: "scheduled", kickoff }, at("2026-09-24T18:46:00Z"))).toBe(
      60_000,
    );
    // Past kick-off and still "scheduled": the provider has not flipped it yet.
    expect(matchRefetchInterval({ status: "scheduled", kickoff }, at("2026-09-24T19:05:00Z"))).toBe(
      60_000,
    );
  });

  test("stops three hours past kick-off, and never for finished or postponed matches", () => {
    expect(matchRefetchInterval({ status: "scheduled", kickoff }, at("2026-09-24T22:01:00Z"))).toBe(
      false,
    );
    expect(matchRefetchInterval({ status: "finished", kickoff }, at(kickoff))).toBe(false);
    expect(matchRefetchInterval({ status: "postponed", kickoff }, at(kickoff))).toBe(false);
    expect(matchRefetchInterval(undefined, at(kickoff))).toBe(false);
    expect(matchRefetchInterval({ status: "scheduled", kickoff: "tbd" }, at(kickoff))).toBe(false);
  });
});
