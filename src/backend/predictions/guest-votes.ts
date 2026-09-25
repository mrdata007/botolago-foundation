import {
  isMatchVoteChoice,
  MATCH_VOTE_QUESTIONS,
  type MatchVoteChoice,
  type MatchVoteInput,
  type MatchVoteQuestion,
} from "./contracts";

/**
 * A visitor's match votes, kept on the phone until they sign in. The page then
 * sends each one through `api.cast_match_vote`, as a visitor's Pronostics
 * picks are imported, and forgets it once the database has answered (taken,
 * or refused for good because the match has kicked off).
 *
 * The most recently voted match is last; past `MAX_GUEST_VOTE_MATCHES` the
 * oldest falls off. A phone that refuses storage (blocked, or full) keeps the
 * votes in memory for the visit instead: the page still shows every one, and
 * a sign-in during the visit still sends them.
 */

export const GUEST_VOTES_KEY = "botolago.predictions.guest-votes.v1";
export const MAX_GUEST_VOTE_MATCHES = 60;

export type GuestMatchVotes = Partial<Record<MatchVoteQuestion, MatchVoteChoice>>;
/** Fixture id to that match's votes, oldest match first. */
export type GuestVotesState = Record<string, GuestMatchVotes>;

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function clean(value: unknown): GuestVotesState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const state: GuestVotesState = {};
  for (const [fixtureId, votes] of Object.entries(value as Record<string, unknown>)) {
    if (!/^[0-9a-f-]{36}$/i.test(fixtureId) || !votes || typeof votes !== "object") continue;
    const kept: GuestMatchVotes = {};
    for (const question of MATCH_VOTE_QUESTIONS) {
      const choice = (votes as Record<string, unknown>)[question];
      if (typeof choice === "string" && isMatchVoteChoice(question, choice))
        kept[question] = choice as MatchVoteChoice;
    }
    if (Object.keys(kept).length > 0) state[fixtureId] = kept;
  }
  return state;
}

/**
 * What this visit wrote when the phone would not keep it. It stands in for
 * storage until a write gets through again, so a second vote does not wipe
 * the first.
 */
let visitOnly: GuestVotesState | null = null;

export function readGuestVotes(): GuestVotesState {
  if (visitOnly) return clean(visitOnly);
  try {
    const raw = storage()?.getItem(GUEST_VOTES_KEY);
    return raw ? clean(JSON.parse(raw)) : {};
  } catch {
    return {};
  }
}

function write(state: GuestVotesState): void {
  // The server renders for everyone: it has no visit to keep votes for.
  if (typeof window === "undefined") return;
  try {
    const store = storage();
    if (!store) throw new Error("storage unavailable");
    if (Object.keys(state).length === 0) store.removeItem(GUEST_VOTES_KEY);
    else store.setItem(GUEST_VOTES_KEY, JSON.stringify(state));
    visitOnly = null;
  } catch {
    visitOnly = clean(state);
  }
}

/** Tests only: forgets what an earlier test kept for its visit. */
export function __forgetVisitVotesForTests(): void {
  visitOnly = null;
}

/** Records (or changes) one vote; the match moves to the end. Returns the new state. */
export function writeGuestVote(
  fixtureId: string,
  question: MatchVoteQuestion,
  choice: MatchVoteChoice,
): GuestVotesState {
  const current = readGuestVotes();
  const votes: GuestMatchVotes = { ...current[fixtureId], [question]: choice };
  const next: GuestVotesState = {};
  for (const [id, kept] of Object.entries(current)) if (id !== fixtureId) next[id] = kept;
  next[fixtureId] = votes;
  const ids = Object.keys(next);
  for (const id of ids.slice(0, Math.max(0, ids.length - MAX_GUEST_VOTE_MATCHES))) delete next[id];
  write(next);
  return next;
}

/** Every vote on the phone, one item per match and question. */
export function guestVoteItems(state: GuestVotesState): MatchVoteInput[] {
  return Object.entries(state).flatMap(([fixtureId, votes]) =>
    MATCH_VOTE_QUESTIONS.flatMap((question) => {
      const choice = votes[question];
      return choice ? [{ fixtureId, question, choice }] : [];
    }),
  );
}

/** Forgets the given votes (sent, or refused for good), keeping any made since. */
export function forgetGuestVotes(items: readonly MatchVoteInput[]): void {
  const next = readGuestVotes();
  for (const item of items) {
    const votes = next[item.fixtureId];
    if (!votes || votes[item.question] !== item.choice) continue;
    delete votes[item.question];
    if (Object.keys(votes).length === 0) delete next[item.fixtureId];
  }
  write(next);
}
