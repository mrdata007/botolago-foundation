import { useCallback, useState } from "react";
import type { MatchEvent } from "@/services/match-live";
import type { Match } from "@/types/domain";

/**
 * When the match page plays its goal moment (Option A, Decision 8): a NEW
 * goal event that arrives while the page is open, and never a goal that was
 * already on the sheet when the page loaded.
 *
 * The rule lives here as pure functions, apart from the component, so it is
 * unit-tested on its own (`goal-moment.test.ts`). The page calls the hook
 * once, above its early returns — not inside `EventTimeline`, which only
 * mounts on the Résumé tab and is remounted by every tab switch, so a goal
 * scored while the reader sits on Stats or Compos would never reach it.
 */

/** The events that change the score — the same set the header's scorers list reads. */
export const GOAL_EVENT_TYPES: ReadonlySet<MatchEvent["type"]> = new Set([
  "goal",
  "penalty_goal",
  "own_goal",
]);

/**
 * A goal this many minutes behind the match clock is a timeline backfill (the
 * provider adding an event it missed), not something that just happened: it
 * joins the timeline quietly instead of taking over the screen. A refresh
 * runs every 30 seconds, so a real goal is never near this.
 */
export const GOAL_MOMENT_MAX_LAG_MINUTES = 10;

/**
 * One step of "which events are new". `seen` is `null` until the first
 * DEFINED event list seeds it, and that list arrives with nothing new: the
 * page never seeds at mount, because the query is often still loading then
 * (always in Arabic, whose query key the server never fills), and an empty
 * seed would turn every goal already on the sheet into an arrival.
 *
 * `undefined` events — the query between two keys, e.g. after a language
 * switch — change nothing. Event ids are stable across languages.
 *
 * Returns the SAME `seen` object when nothing arrived, so a caller can
 * compare by identity and skip a state update.
 */
export function trackArrivals<E extends { readonly id: string }>(
  seen: ReadonlySet<string> | null,
  events: readonly E[] | undefined,
): { seen: ReadonlySet<string> | null; arrived: E[] } {
  if (!events) return { seen, arrived: [] };
  if (seen === null) return { seen: new Set(events.map((event) => event.id)), arrived: [] };
  const arrived = events.filter((event) => !seen.has(event.id));
  if (arrived.length === 0) return { seen, arrived };
  return { seen: new Set([...seen, ...arrived.map((event) => event.id)]), arrived };
}

/** Timeline order: minute, then added time, then the provider's sequence. */
function compareEvents(left: MatchEvent, right: MatchEvent): number {
  return (
    left.minute - right.minute || left.addedTime - right.addedTime || left.sequence - right.sequence
  );
}

/**
 * The goal to celebrate among the events that just arrived, or `null`.
 *
 * Only while the match is live; only a goal type with a known side (the
 * takeover is painted in the scoring club's colour, so a goal with no team
 * cannot have one); not a backfill. When one refresh brings several goals —
 * a tab that was hidden for a while refetches on focus — only the newest is
 * shown.
 */
export function goalToCelebrate(
  arrived: readonly MatchEvent[],
  match: Pick<Match, "status" | "minute"> | undefined,
): MatchEvent | null {
  if (!match || match.status !== "live") return null;
  let newest: MatchEvent | null = null;
  for (const event of arrived) {
    if (!GOAL_EVENT_TYPES.has(event.type) || event.side === null) continue;
    if (match.minute !== undefined && match.minute - event.minute > GOAL_MOMENT_MAX_LAG_MINUTES) {
      continue;
    }
    if (!newest || compareEvents(event, newest) > 0) newest = event;
  }
  return newest;
}

export interface GoalMomentState {
  /** The match these ids belong to: a new match starts from nothing. */
  readonly matchId: string;
  readonly seen: ReadonlySet<string> | null;
  /** The goal on screen now, or `null`. */
  readonly goal: MatchEvent | null;
}

export interface GoalMomentInput {
  readonly matchId: string;
  readonly events: readonly MatchEvent[] | undefined;
  readonly match: Pick<Match, "status" | "minute"> | undefined;
}

/** The state before anything has happened: seeded when the events are already known. */
export function initialGoalMomentState(
  matchId: string,
  events: readonly MatchEvent[] | undefined,
): GoalMomentState {
  return { matchId, seen: trackArrivals(null, events).seen, goal: null };
}

/**
 * One render's worth of the rule. A different `matchId` starts over (the H2H
 * list links to other matches and the page component survives the
 * navigation). A new goal replaces the one on screen; arrivals that are not
 * goals leave it alone. Returns `state` itself when nothing changed.
 */
export function stepGoalMoment(state: GoalMomentState, input: GoalMomentInput): GoalMomentState {
  const base =
    state.matchId === input.matchId ? state : { matchId: input.matchId, seen: null, goal: null };
  const { seen, arrived } = trackArrivals(base.seen, input.events);
  const goal = goalToCelebrate(arrived, input.match) ?? base.goal;
  if (base === state && seen === state.seen && goal === state.goal) return state;
  return { matchId: input.matchId, seen, goal };
}

/** Takes the goal off screen and keeps the ids — it will not come back. */
export function dismissGoalMoment(state: GoalMomentState): GoalMomentState {
  return state.goal ? { ...state, goal: null } : state;
}

/**
 * The page-level hook: the goal to show now, and the way to put it away (the
 * takeover's own timer, a tap, Escape).
 *
 * The step runs during render — React's "adjust state when a prop changes"
 * pattern, as `EventTimeline` does for its entrance — so the takeover mounts
 * in the same commit as the new score, and a refetch that brings nothing new
 * returns the same state object and costs no extra render.
 */
export function useGoalMoment(
  matchId: string,
  events: readonly MatchEvent[] | undefined,
  match: Pick<Match, "status" | "minute"> | undefined,
): { goal: MatchEvent | null; dismiss: () => void } {
  const [state, setState] = useState(() => initialGoalMomentState(matchId, events));
  const next = stepGoalMoment(state, { matchId, events, match });
  if (next !== state) setState(next);
  const dismiss = useCallback(() => setState(dismissGoalMoment), []);
  return { goal: next.goal, dismiss };
}
