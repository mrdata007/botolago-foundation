import type { RepositoryContext } from "@/backend/contracts/repository";
import type { FootballLanguage, TeamSummaryDto } from "@/backend/football/contracts";
import * as mock from "@/mocks/data";
import {
  INVITE_CODE_PATTERN,
  isMatchVoteChoice,
  LEAGUE_NAME_MAX,
  LEAGUE_NAME_MIN,
  MAX_CLAIM_ITEMS,
  MAX_ITEMS_PER_SAVE,
  MATCH_VOTE_CHOICES,
  MATCH_VOTE_QUESTIONS,
  matchVotesResponseSchema,
  type ClaimGuestPredictionsDto,
  type ClaimStatus,
  type CreateLeagueDto,
  type GuestClaimInput,
  type JoinLeagueDto,
  type LeaderboardDto,
  type LeaderboardEntryDto,
  type LeaderboardRequest,
  type LeagueStandingEntryDto,
  type LeagueStandingsDto,
  type LeaveLeagueDto,
  type MatchVoteChoice,
  type MatchVoteInput,
  type MatchVoteQuestion,
  type MatchVotesDto,
  type MyLeaguesDto,
  type MyPredictionsDto,
  type MyPredictionsRequest,
  type PredictionFixtureDto,
  type PredictionInput,
  type PredictionsMode,
  type PredictionsRepository,
  type PredictionsRoundDto,
  type ResetInviteCodeDto,
  type ResultKind,
  type RoundRequest,
  type RoundState,
  type SavePredictionsDto,
  type SaveResultDto,
} from "./contracts";
import { PredictionsError } from "./errors";
import { predictionPoints, predictionResultKind } from "./scoring";

/**
 * Pronostics without a database: the same contracts, answered from the
 * product's mock football data, for development and the Playwright suite.
 *
 * It keeps its own server clock. The page must use the `serverTime` it is
 * given, never the phone's, to decide what is locked; to prove it, a test sets
 * `botolago.e2e.mock-server-skew-ms` (sessionStorage) and moves the phone's
 * clock by the same amount: the mock server stays right while the phone is
 * wrong. `botolago.e2e.predictions-mode` switches the mock off or to testers.
 *
 * Journées 13 and 14 are the mock football matches with the SAME fixture ids
 * the mock match pages use, so a prediction made on /pronostics shows on the
 * match page. Journée 15 is a week later.
 */

const uuid = (domain: number, index: number) =>
  `${String(domain).padStart(8, "0")}-0000-4000-8000-${String(index).padStart(12, "0")}`;

const MOCK_STATE_KEY = "botolago.mock.predictions.v1";
const SKEW_KEY = "botolago.e2e.mock-server-skew-ms";
const MODE_KEY = "botolago.e2e.predictions-mode";
/** Joins "Les Lions de l'Atlas" in the mock. */
export const MOCK_INVITE_CODE = "A1B2C3D4E5F60718293A4B5C6D7E8F90";

const SEASON_ID = uuid(50, 1);
const clubIndex = new Map(mock.clubs.map((club, index) => [club.id, index + 1]));
const clubUuid = (sourceId: string) => uuid(10, clubIndex.get(sourceId)!);

function sessionValue(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

/** The mock server's clock. */
export function mockServerNow(): number {
  const skew = Number(sessionValue(SKEW_KEY) ?? "0");
  return Date.now() - (Number.isFinite(skew) ? skew : 0);
}

function mockMode(): PredictionsMode {
  const mode = sessionValue(MODE_KEY);
  return mode === "off" || mode === "testers" ? mode : "public";
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

interface MockFixture {
  readonly id: string;
  readonly round: number;
  readonly home: string;
  readonly away: string;
  readonly kickoffAt: string;
  readonly status: PredictionFixtureDto["status"];
  readonly score: { home: number; away: number } | null;
}

const seasonStartYear = (() => {
  const now = new Date();
  return now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
})();

const hoursFromLoad = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();

const FIXTURES: readonly MockFixture[] = [
  ...mock.matches.map(
    (match, index): MockFixture => ({
      id: uuid(20, index + 1),
      round: match.gameweek,
      home: match.homeClubId,
      away: match.awayClubId,
      kickoffAt: match.kickoff,
      status:
        match.status === "live"
          ? "live_second_half"
          : match.status === "finished"
            ? "finished"
            : match.status === "postponed"
              ? "postponed"
              : "scheduled",
      score:
        match.homeScore !== undefined && match.awayScore !== undefined
          ? { home: match.homeScore, away: match.awayScore }
          : null,
    }),
  ),
  ...(
    [
      ["war", "rca", 168],
      ["asfar", "fus", 170],
      ["rsb", "mat", 192],
      ["hus", "moas", 194],
    ] as const
  ).map(
    ([home, away, hours], index): MockFixture => ({
      id: uuid(29, index + 1),
      round: 15,
      home,
      away,
      kickoffAt: hoursFromLoad(hours),
      status: "scheduled",
      score: null,
    }),
  ),
];

const LIVE_STATUSES = new Set([
  "live_first_half",
  "half_time",
  "live_second_half",
  "extra_time",
  "penalties",
  "suspended",
]);

function isOpen(fixture: MockFixture, now: number): boolean {
  return (
    (fixture.status === "scheduled" || fixture.status === "not_started") &&
    now < Date.parse(fixture.kickoffAt)
  );
}

function isFinal(fixture: MockFixture): boolean {
  return fixture.status === "finished" && fixture.score !== null;
}

function isVoid(fixture: MockFixture): boolean {
  return fixture.status === "cancelled" || fixture.status === "abandoned";
}

function team(sourceId: string, language: FootballLanguage): TeamSummaryDto {
  const club = mock.clubs.find((candidate) => candidate.id === sourceId)!;
  return {
    id: clubUuid(club.id),
    slug: club.id,
    name: club.name[language] || club.name.fr,
    shortName: club.shortName[language] || club.shortName.fr,
    code: club.crestPlaceholder,
    city: club.city[language] || club.city.fr,
    countryCode: "MA",
    crestUrl: null,
    crestPath: null,
    primaryColor: club.primaryColor,
    secondaryColor: club.secondaryColor ?? null,
    active: true,
  };
}

/** `app_private.prediction_round_state`, ported. */
function roundState(round: number, now: number): RoundState {
  const fixtures = FIXTURES.filter((fixture) => fixture.round === round);
  if (fixtures.length === 0) return "upcoming";
  if (fixtures.every((fixture) => isFinal(fixture) || isVoid(fixture))) return "completed";
  const kickedOff = fixtures.filter(
    (fixture) =>
      Date.parse(fixture.kickoffAt) <= now && fixture.status !== "postponed" && !isVoid(fixture),
  );
  if (kickedOff.length === 0) return "upcoming";
  if (
    fixtures.every(
      (fixture) => isFinal(fixture) || isVoid(fixture) || fixture.status === "postponed",
    )
  )
    return "provisional";
  return "in_progress";
}

/** `app_private.predictions_current_round`, ported. */
function currentRound(now: number): number {
  const candidates = FIXTURES.filter((fixture) => !isVoid(fixture));
  const rounds = [...new Set(candidates.map((fixture) => fixture.round))].map((round) => {
    const inRound = candidates.filter((fixture) => fixture.round === round);
    return {
      round,
      fixtures: inRound.length,
      started: inRound.filter(
        (fixture) => Date.parse(fixture.kickoffAt) <= now && fixture.status !== "postponed",
      ).length,
      open: inRound.filter((fixture) => isOpen(fixture, now)).length,
    };
  });
  const open = candidates
    .filter((fixture) => isOpen(fixture, now))
    .sort((a, b) => Date.parse(a.kickoffAt) - Date.parse(b.kickoffAt) || a.round - b.round);
  const chosen = open.find(
    (fixture) =>
      !rounds.some((later) => later.round > fixture.round && later.started * 2 >= later.fixtures) &&
      !rounds.some(
        (earlier) => earlier.round < fixture.round && earlier.open * 2 > earlier.fixtures,
      ),
  );
  if (chosen) return chosen.round;
  if (open[0]) return open[0].round;
  const started = candidates
    .filter((fixture) => Date.parse(fixture.kickoffAt) <= now && fixture.status !== "postponed")
    .sort((a, b) => Date.parse(b.kickoffAt) - Date.parse(a.kickoffAt));
  return started[0]?.round ?? Math.min(...candidates.map((fixture) => fixture.round));
}

const ROUND_NUMBERS = [...new Set(FIXTURES.map((fixture) => fixture.round))].sort((a, b) => a - b);

// ---------------------------------------------------------------------------
// State (persisted so a reload keeps a signed-in player's picks)
// ---------------------------------------------------------------------------

interface StoredPrediction {
  home: number;
  away: number;
  homeTeamId: string;
  awayTeamId: string;
  submittedAt: string;
}

interface StoredLeague {
  id: string;
  name: string;
  ownerId: string;
  code: string;
  createdAt: string;
  /** Account ids of Pronostics members; `owner` is one of them. */
  members: string[];
  /** Synthetic members already in the league. */
  crowd: number;
}

/** A mock account's votes on one match. */
type StoredVotes = Partial<Record<MatchVoteQuestion, MatchVoteChoice>>;

interface MockState {
  predictions: Record<string, Record<string, StoredPrediction>>;
  seeded: string[];
  leagues: StoredLeague[];
  claims: number;
  /** Fixture id, then account id. */
  votes: Record<string, Record<string, StoredVotes>>;
}

function initialState(): MockState {
  return {
    predictions: {},
    seeded: [],
    leagues: [
      {
        id: uuid(80, 1),
        name: "Les Lions de l'Atlas",
        ownerId: "mock-owner",
        code: MOCK_INVITE_CODE,
        createdAt: new Date(0).toISOString(),
        members: ["mock-owner"],
        crowd: 7,
      },
    ],
    claims: 0,
    votes: {},
  };
}

let memoryState: MockState | null = null;

function loadState(): MockState {
  if (memoryState) return memoryState;
  let loaded: MockState | null = null;
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(MOCK_STATE_KEY);
      loaded = raw ? (JSON.parse(raw) as MockState) : null;
    } catch {
      loaded = null;
    }
  }
  memoryState =
    loaded && Array.isArray(loaded.leagues)
      ? { ...loaded, votes: loaded.votes ?? {} }
      : initialState();
  return memoryState;
}

function saveState(state: MockState): void {
  memoryState = state;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(MOCK_STATE_KEY, JSON.stringify(state));
  } catch {
    /* memory only */
  }
}

/** Test hook: forget every mock prediction and league. */
export function resetMockPredictionsState(): void {
  memoryState = initialState();
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(MOCK_STATE_KEY);
  } catch {
    /* memory only */
  }
}

/** A signed-in mock player arrives with journée 13 already predicted, to show results. */
function predictionsOf(state: MockState, actorId: string): Record<string, StoredPrediction> {
  if (!state.seeded.includes(actorId)) {
    const seeded: Record<string, StoredPrediction> = {};
    const [first, second] = FIXTURES.filter((fixture) => fixture.round === 13);
    if (first)
      seeded[first.id] = {
        home: 2,
        away: 0,
        homeTeamId: clubUuid(first.home),
        awayTeamId: clubUuid(first.away),
        submittedAt: new Date(Date.parse(first.kickoffAt) - 86_400_000).toISOString(),
      };
    if (second)
      seeded[second.id] = {
        home: 0,
        away: 1,
        homeTeamId: clubUuid(second.home),
        awayTeamId: clubUuid(second.away),
        submittedAt: new Date(Date.parse(second.kickoffAt) - 86_400_000).toISOString(),
      };
    state.predictions[actorId] = { ...seeded, ...(state.predictions[actorId] ?? {}) };
    state.seeded.push(actorId);
    saveState(state);
  }
  return (state.predictions[actorId] ??= {});
}

interface Scored {
  points: number | null;
  kind: ResultKind | null;
}

function scoreOf(prediction: StoredPrediction, fixture: MockFixture): Scored {
  if (isVoid(fixture)) return { points: 0, kind: "void" };
  if (!isFinal(fixture) || !fixture.score) return { points: null, kind: null };
  if (Date.parse(prediction.submittedAt) >= Date.parse(fixture.kickoffAt))
    return { points: 0, kind: "late" };
  const pick = { home: prediction.home, away: prediction.away };
  return {
    points: predictionPoints(pick, fixture.score),
    kind: predictionResultKind(pick, fixture.score),
  };
}

interface Totals {
  points: number;
  exact: number;
  scored: number;
}

function totalsFor(predictions: Record<string, StoredPrediction>, round: number | null): Totals {
  const totals: Totals = { points: 0, exact: 0, scored: 0 };
  for (const [fixtureId, prediction] of Object.entries(predictions)) {
    const fixture = FIXTURES.find((candidate) => candidate.id === fixtureId);
    if (!fixture || (round !== null && fixture.round !== round)) continue;
    const scored = scoreOf(prediction, fixture);
    if (scored.kind === "exact" || scored.kind === "outcome" || scored.kind === "miss") {
      totals.scored += 1;
      totals.points += scored.points ?? 0;
      if (scored.kind === "exact") totals.exact += 1;
    }
  }
  return totals;
}

// ---------------------------------------------------------------------------
// Synthetic players for the rankings
// ---------------------------------------------------------------------------

const FIRST_NAMES = [
  "Youssef",
  "Salma",
  "Karim",
  "Imane",
  "Hamza",
  "Nour",
  "Achraf",
  "Aya",
  "Mehdi",
  "Kawtar",
  "Anas",
  "Hiba",
  "Omar",
  "Rania",
  "Ilyas",
  "Sara",
  "Zakaria",
  "Meryem",
  "Ayoub",
  "Yasmine",
];

interface SyntheticPlayer {
  readonly id: string;
  readonly displayName: string;
  readonly username: string;
  readonly roundPoints: number;
  readonly roundExact: number;
  readonly seasonPoints: number;
  readonly seasonExact: number;
  readonly roundsPlayed: number;
}

const PLAYERS: readonly SyntheticPlayer[] = Array.from({ length: 57 }, (_, index) => {
  const first = FIRST_NAMES[index % FIRST_NAMES.length]!;
  const roundExact = (index * 7) % 3;
  const roundPoints = roundExact * 3 + ((index * 5) % 3);
  return {
    id: uuid(90, index + 1),
    displayName: `${first} ${String.fromCharCode(65 + ((index * 3) % 26))}.`,
    username: `${first.toLowerCase()}_${10 + index}`,
    roundPoints,
    roundExact,
    seasonPoints: roundPoints + 8 + ((index * 13) % 41),
    seasonExact: roundExact + ((index * 11) % 7),
    roundsPlayed: 1 + ((index * 5) % 13),
  };
});

function mask(username: string): string {
  return username.length <= 2
    ? `${username.slice(0, 1)}***`
    : `${username.slice(0, 1)}***${username.slice(-1)}`;
}

interface Ranked<T> {
  row: T;
  rank: number;
  tied: boolean;
}

function rankRows<T extends { points: number; exact: number }>(rows: readonly T[]): Ranked<T>[] {
  const sorted = [...rows].sort((a, b) => b.points - a.points || b.exact - a.exact);
  return sorted.map((row) => {
    const first = sorted.findIndex(
      (other) => other.points === row.points && other.exact === row.exact,
    );
    const tied = sorted.filter(
      (other) => other.points === row.points && other.exact === row.exact,
    ).length;
    return { row, rank: first + 1, tied: tied > 1 };
  });
}

// ---------------------------------------------------------------------------
// The repository
// ---------------------------------------------------------------------------

function fail(code: ConstructorParameters<typeof PredictionsError>[0]): never {
  throw new PredictionsError(code, code);
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function assertAllowed(context: RepositoryContext): string {
  if (!context.actorId) fail("predictions_unauthenticated");
  if (mockMode() === "off") fail("predictions_unavailable");
  return context.actorId;
}

function assertItems(items: readonly PredictionInput[], max: number): void {
  const ids = new Set(items.map((item) => item.fixtureId.toLowerCase()));
  if (
    items.length < 1 ||
    items.length > max ||
    ids.size !== items.length ||
    items.some(
      (item) =>
        !Number.isInteger(item.home) ||
        !Number.isInteger(item.away) ||
        item.home < 0 ||
        item.away < 0 ||
        item.home > 20 ||
        item.away > 20,
    )
  )
    fail("predictions_invalid_payload");
}

function normalizeCode(code: string): string | null {
  const normalized = code.replace(/[\s-]/g, "").toUpperCase();
  return INVITE_CODE_PATTERN.test(normalized) ? normalized : null;
}

function mintCode(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return [...bytes]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

/**
 * The votes of the mock crowd on a match: fixed per match and question, so
 * the shares look like a real crowd's and a test can predict them.
 */
function crowdVotes(fixtureId: string, question: MatchVoteQuestion): number[] {
  let hash = 0;
  for (const char of `${fixtureId}:${question}`) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return MATCH_VOTE_CHOICES[question].map((_, index) => 20 + ((hash >>> (index * 7)) % 60));
}

export class MockPredictionsRepository implements PredictionsRepository {
  async getRound(input: RoundRequest, context: RepositoryContext): Promise<PredictionsRoundDto> {
    const now = mockServerNow();
    const mode = mockMode();
    if (mode === "off") return { schemaVersion: 1, mode, allowed: false, serverTime: iso(now) };
    const number = input.roundNumber ?? currentRound(now);
    if (!ROUND_NUMBERS.includes(number)) fail("predictions_round_not_found");
    void context;
    const fixtures = FIXTURES.filter((fixture) => fixture.round === number).sort(
      (a, b) => Date.parse(a.kickoffAt) - Date.parse(b.kickoffAt),
    );
    const state = roundState(number, now);
    const openKickoffs = fixtures
      .filter((fixture) => isOpen(fixture, now))
      .map((fixture) => Date.parse(fixture.kickoffAt));
    return {
      schemaVersion: 1,
      mode,
      allowed: true,
      serverTime: iso(now),
      season: { id: SEASON_ID, label: `${seasonStartYear}/${seasonStartYear + 1}` },
      round: {
        id: uuid(70, number),
        number,
        name: `Journée ${number}`,
        state,
        provisional: state !== "completed",
        nextLockAt: openKickoffs.length > 0 ? iso(Math.min(...openKickoffs)) : null,
        scoringVersion: fixtures.filter(isFinal).length,
      },
      rounds: ROUND_NUMBERS.map((round) => ({ number: round, state: roundState(round, now) })),
      fixtures: fixtures.map((fixture) => {
        const kickoff = new Date(fixture.kickoffAt);
        return {
          id: fixture.id,
          kickoffAt: fixture.kickoffAt,
          kickoffConfirmed: !(kickoff.getUTCHours() === 0 && kickoff.getUTCMinutes() === 0),
          status: fixture.status,
          open: isOpen(fixture, now),
          home: team(fixture.home, input.language),
          away: team(fixture.away, input.language),
          live: LIVE_STATUSES.has(fixture.status) && fixture.score ? { ...fixture.score } : null,
          result: isFinal(fixture) && fixture.score ? { ...fixture.score } : null,
          final: isFinal(fixture),
          void: isVoid(fixture),
          corrected: false,
        };
      }),
    };
  }

  async getMyPredictions(
    input: MyPredictionsRequest,
    context: RepositoryContext,
  ): Promise<MyPredictionsDto> {
    const actorId = assertAllowed(context);
    const now = mockServerNow();
    const state = loadState();
    const mine = predictionsOf(state, actorId);
    const item = (fixtureId: string, prediction: StoredPrediction) => {
      const fixture = FIXTURES.find((candidate) => candidate.id === fixtureId)!;
      const scored = scoreOf(prediction, fixture);
      return {
        fixtureId,
        home: prediction.home,
        away: prediction.away,
        submittedAt: prediction.submittedAt,
        points: scored.points,
        resultKind: scored.kind,
      };
    };
    if (input.fixtureId) {
      const prediction = mine[input.fixtureId];
      return {
        serverTime: iso(now),
        items: prediction ? [item(input.fixtureId, prediction)] : [],
        summary: null,
      };
    }
    const round = input.roundNumber ?? currentRound(now);
    if (!ROUND_NUMBERS.includes(round)) fail("predictions_round_not_found");
    const fixtures = FIXTURES.filter((fixture) => fixture.round === round).sort(
      (a, b) => Date.parse(a.kickoffAt) - Date.parse(b.kickoffAt),
    );
    const items = fixtures
      .filter((fixture) => mine[fixture.id])
      .map((fixture) => item(fixture.id, mine[fixture.id]!));
    const roundTotals = totalsFor(mine, round);
    const seasonTotals = totalsFor(mine, null);
    const board = this.board(round, actorId);
    const seasonBoard = this.board(null, actorId);
    return {
      serverTime: iso(now),
      items,
      summary: {
        predicted: items.length,
        total: fixtures.filter((fixture) => !isVoid(fixture)).length,
        points: roundTotals.points,
        exact: roundTotals.exact,
        rank: board.find((entry) => entry.isMe)?.rank ?? null,
        seasonPoints: seasonTotals.points,
        seasonRank: seasonBoard.find((entry) => entry.isMe)?.rank ?? null,
        roundsPlayed: ROUND_NUMBERS.filter((number) => totalsFor(mine, number).scored > 0).length,
      },
    };
  }

  async savePredictions(
    items: readonly PredictionInput[],
    context: RepositoryContext,
  ): Promise<SavePredictionsDto> {
    const actorId = assertAllowed(context);
    assertItems(items, MAX_ITEMS_PER_SAVE);
    const now = mockServerNow();
    const state = loadState();
    const mine = predictionsOf(state, actorId);
    const results: SaveResultDto[] = items.map((item) => {
      const fixture = FIXTURES.find((candidate) => candidate.id === item.fixtureId);
      const existing = mine[item.fixtureId];
      const current = (status: SaveResultDto["status"]): SaveResultDto => ({
        fixtureId: item.fixtureId,
        status,
        home: mine[item.fixtureId]?.home ?? null,
        away: mine[item.fixtureId]?.away ?? null,
        submittedAt: mine[item.fixtureId]?.submittedAt ?? null,
      });
      if (!fixture) return current("not_eligible");
      if (!isOpen(fixture, now)) return current("locked");
      if (existing && existing.home === item.home && existing.away === item.away)
        return current("unchanged");
      mine[item.fixtureId] = {
        home: item.home,
        away: item.away,
        homeTeamId: clubUuid(fixture.home),
        awayTeamId: clubUuid(fixture.away),
        submittedAt: iso(now),
      };
      return current("saved");
    });
    saveState(state);
    return { serverTime: iso(now), results };
  }

  async claimGuestPredictions(
    items: readonly GuestClaimInput[],
    context: RepositoryContext,
  ): Promise<ClaimGuestPredictionsDto> {
    const actorId = assertAllowed(context);
    assertItems(items, MAX_CLAIM_ITEMS);
    const now = mockServerNow();
    const state = loadState();
    const mine = predictionsOf(state, actorId);
    const results = items.map((item): { fixtureId: string; status: ClaimStatus } => {
      const fixture = FIXTURES.find((candidate) => candidate.id === item.fixtureId);
      if (!fixture) return { fixtureId: item.fixtureId, status: "invalid" };
      const home = clubUuid(fixture.home);
      const away = clubUuid(fixture.away);
      const swapped = item.homeTeamId === away && item.awayTeamId === home;
      if (!swapped && !(item.homeTeamId === home && item.awayTeamId === away))
        return { fixtureId: item.fixtureId, status: "invalid" };
      if (mine[item.fixtureId]) return { fixtureId: item.fixtureId, status: "kept" };
      if (!isOpen(fixture, now)) return { fixtureId: item.fixtureId, status: "started" };
      mine[item.fixtureId] = {
        home: swapped ? item.away : item.home,
        away: swapped ? item.home : item.away,
        homeTeamId: home,
        awayTeamId: away,
        submittedAt: iso(now),
      };
      return { fixtureId: item.fixtureId, status: "imported" };
    });
    state.claims += 1;
    saveState(state);
    const countOf = (status: ClaimStatus) =>
      results.filter((result) => result.status === status).length;
    return {
      serverTime: iso(now),
      imported: countOf("imported"),
      keptExisting: countOf("kept"),
      started: countOf("started"),
      invalid: countOf("invalid"),
      results,
    };
  }

  /** One ranking (a journée, or the season with `round` null) including the caller. */
  private board(round: number | null, actorId: string | null) {
    const rows = PLAYERS.map((player) => ({
      id: player.id,
      name: player.displayName,
      username: player.username,
      points: round === null ? player.seasonPoints : round === 13 ? player.roundPoints : 0,
      exact: round === null ? player.seasonExact : round === 13 ? player.roundExact : 0,
      roundsPlayed: round === null ? player.roundsPlayed : null,
      isMe: false,
      scored: round === null || round === 13,
    })).filter((row) => row.scored);
    if (actorId) {
      const mine = predictionsOf(loadState(), actorId);
      const totals = totalsFor(mine, round);
      if (totals.scored > 0)
        rows.push({
          id: uuid(91, 1),
          name: "Vous",
          username: "vous",
          points: totals.points,
          exact: totals.exact,
          roundsPlayed:
            round === null
              ? ROUND_NUMBERS.filter((number) => totalsFor(mine, number).scored > 0).length
              : null,
          isMe: true,
          scored: true,
        });
    }
    return rankRows(rows).map(({ row, rank, tied }) => ({ ...row, rank, tied }));
  }

  async getLeaderboard(
    input: LeaderboardRequest,
    context: RepositoryContext,
  ): Promise<LeaderboardDto> {
    const mode = mockMode();
    if (mode === "off") return { allowed: false, mode };
    const now = mockServerNow();
    const round = input.scope === "round" ? (input.roundNumber ?? currentRound(now)) : null;
    if (round !== null && !ROUND_NUMBERS.includes(round)) fail("predictions_round_not_found");
    const signedIn = Boolean(context.actorId);
    const board = this.board(round, context.actorId);
    const after = input.cursor ? board.findIndex((entry) => entry.id === input.cursor!.id) + 1 : 0;
    const limit = Math.min(Math.max(Math.trunc(input.limit), 1), 100);
    const page = board.slice(after, after + limit);
    const hasMore = after + limit < board.length;
    const me = board.find((entry) => entry.isMe);
    const items: LeaderboardEntryDto[] = page.map((entry) => ({
      id: entry.id,
      rank: entry.rank,
      tied: entry.tied,
      name: entry.isMe || signedIn ? entry.name : mask(entry.username),
      points: entry.points,
      exact: entry.exact,
      roundsPlayed: entry.roundsPlayed,
      isMe: entry.isMe,
    }));
    const last = page.at(-1);
    return {
      allowed: true,
      scope: input.scope,
      round: round ?? null,
      provisional: round === null ? null : roundState(round, now) !== "completed",
      matchesLeft:
        round === null
          ? null
          : FIXTURES.filter(
              (fixture) => fixture.round === round && !isFinal(fixture) && !isVoid(fixture),
            ).length,
      total: input.cursor ? null : board.length,
      items,
      nextCursor: hasMore && last ? { rank: last.rank, id: last.id } : null,
      me: me
        ? {
            rank: me.rank,
            points: me.points,
            exact: me.exact,
            ...(round === null ? { roundsPlayed: me.roundsPlayed } : {}),
          }
        : null,
    };
  }

  async listMyLeagues(context: RepositoryContext): Promise<MyLeaguesDto> {
    const actorId = assertAllowed(context);
    const state = loadState();
    const seasonPoints = totalsFor(predictionsOf(state, actorId), null).points;
    return {
      items: state.leagues
        .filter((league) => league.members.includes(actorId))
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((league) => ({
          leagueId: league.id,
          name: league.name,
          via: "predictions" as const,
          role: league.ownerId === actorId ? ("owner" as const) : ("member" as const),
          members: league.members.length + league.crowd,
          inviteCodeHint: league.ownerId === actorId ? league.code.slice(-4) : null,
          seasonPoints,
        })),
    };
  }

  async getLeagueStandings(
    input: { leagueId: string; roundNumber: number | null },
    context: RepositoryContext,
  ): Promise<LeagueStandingsDto> {
    const actorId = assertAllowed(context);
    const state = loadState();
    const now = mockServerNow();
    const stored = state.leagues.find((league) => league.id === input.leagueId);
    // A mock Fantasy league (lg1, lg2 …): its Pronostics side, with its crowd.
    const league: StoredLeague = stored ?? {
      id: input.leagueId,
      name: "Ligue Fantasy",
      ownerId: "mock-owner",
      code: MOCK_INVITE_CODE,
      createdAt: new Date(0).toISOString(),
      members: [actorId],
      crowd: 9,
    };
    if (!league.members.includes(actorId)) fail("league_access_denied");
    const round = input.roundNumber;
    if (round !== null && !ROUND_NUMBERS.includes(round)) fail("predictions_round_not_found");
    const crowd = PLAYERS.slice(0, league.crowd).map((player) => ({
      name: player.displayName,
      points: round === null ? player.seasonPoints : round === 13 ? player.roundPoints : 0,
      exact: round === null ? player.seasonExact : round === 13 ? player.roundExact : 0,
      roundsPlayed: round === null ? player.roundsPlayed : null,
      isMe: false,
      played: round === null || round === 13,
    }));
    const members = league.members.map((memberId) => {
      const totals = totalsFor(predictionsOf(state, memberId), round);
      return {
        name: memberId === actorId ? "Vous" : "Membre",
        points: totals.points,
        exact: totals.exact,
        roundsPlayed:
          round === null
            ? ROUND_NUMBERS.filter(
                (number) => totalsFor(predictionsOf(state, memberId), number).scored > 0,
              ).length
            : null,
        isMe: memberId === actorId,
        played: totals.scored > 0,
      };
    });
    const everyone = [...crowd, ...members];
    const played = everyone.filter((row) => row.played);
    const items: LeagueStandingEntryDto[] = rankRows(played).map(({ row, rank, tied }) => ({
      rank,
      tied,
      name: row.name,
      points: row.points,
      exact: row.exact,
      roundsPlayed: row.roundsPlayed,
      isMe: row.isMe,
    }));
    void now;
    return {
      league: {
        id: league.id,
        name: league.name,
        isOwner: league.ownerId === actorId,
        inviteCodeHint: league.ownerId === actorId ? league.code.slice(-4) : null,
      },
      scope: round === null ? "season" : "round",
      round,
      items,
      members: everyone.length,
      notPlayed: everyone.length - played.length,
    };
  }

  async joinLeague(inviteCode: string, context: RepositoryContext): Promise<JoinLeagueDto> {
    const actorId = assertAllowed(context);
    const code = normalizeCode(inviteCode);
    const state = loadState();
    const league = code ? state.leagues.find((candidate) => candidate.code === code) : undefined;
    if (!league) fail("invite_code_invalid");
    if (league.members.includes(actorId))
      return { leagueId: league.id, name: league.name, joined: false, via: "predictions" };
    if (state.leagues.filter((candidate) => candidate.members.includes(actorId)).length >= 50)
      fail("league_limit_reached");
    league.members.push(actorId);
    saveState(state);
    return { leagueId: league.id, name: league.name, joined: true, via: "predictions" };
  }

  async leaveLeague(leagueId: string, context: RepositoryContext): Promise<LeaveLeagueDto> {
    const actorId = assertAllowed(context);
    const state = loadState();
    const league = state.leagues.find((candidate) => candidate.id === leagueId);
    if (!league || !league.members.includes(actorId)) fail("league_membership_not_found");
    if (league.ownerId === actorId) fail("league_owner_cannot_leave");
    league.members = league.members.filter((memberId) => memberId !== actorId);
    saveState(state);
    return { leagueId, left: true };
  }

  async createLeague(name: string, context: RepositoryContext): Promise<CreateLeagueDto> {
    const actorId = assertAllowed(context);
    if (name !== name.trim() || name.length < LEAGUE_NAME_MIN || name.length > LEAGUE_NAME_MAX)
      fail("validation_failed");
    const state = loadState();
    const now = mockServerNow();
    const recent = state.leagues.find(
      (league) =>
        league.ownerId === actorId &&
        league.name === name &&
        now - Date.parse(league.createdAt) < 60_000,
    );
    if (recent) return { leagueId: recent.id, name, inviteCode: null, created: false };
    if (state.leagues.filter((league) => league.ownerId === actorId).length >= 5)
      fail("league_create_limit_reached");
    const code = mintCode();
    const league: StoredLeague = {
      id: uuid(81, state.leagues.length + 1),
      name,
      ownerId: actorId,
      code,
      createdAt: iso(now),
      members: [actorId],
      crowd: 0,
    };
    state.leagues.push(league);
    saveState(state);
    return { leagueId: league.id, name, inviteCode: code, created: true };
  }

  async resetLeagueInviteCode(
    leagueId: string,
    context: RepositoryContext,
  ): Promise<ResetInviteCodeDto> {
    const actorId = assertAllowed(context);
    const state = loadState();
    const league = state.leagues.find((candidate) => candidate.id === leagueId);
    if (!league || league.ownerId !== actorId) fail("league_access_denied");
    league.code = mintCode();
    saveState(state);
    return { leagueId, inviteCode: league.code };
  }

  async getMatchVotes(fixtureId: string, context: RepositoryContext): Promise<MatchVotesDto> {
    const now = mockServerNow();
    if (mockMode() === "off") return { schemaVersion: 1, allowed: false, serverTime: iso(now) };
    const fixture = FIXTURES.find((candidate) => candidate.id === fixtureId);
    const cast = loadState().votes[fixtureId] ?? {};
    const mine = context.actorId ? (cast[context.actorId] ?? {}) : {};
    return matchVotesResponseSchema.parse({
      schemaVersion: 1,
      allowed: true,
      serverTime: iso(now),
      fixtureId,
      covered: fixture !== undefined,
      open: fixture !== undefined && isOpen(fixture, now),
      questions: MATCH_VOTE_QUESTIONS.map((question) => {
        const crowd = crowdVotes(fixtureId, question);
        const counts = Object.fromEntries(
          MATCH_VOTE_CHOICES[question].map((choice, index) => [
            choice,
            crowd[index]! +
              Object.values(cast).filter((votes) => votes[question] === choice).length,
          ]),
        );
        return { question, counts, mine: mine[question] ?? null };
      }),
    });
  }

  async castMatchVote(input: MatchVoteInput, context: RepositoryContext): Promise<MatchVotesDto> {
    const actorId = assertAllowed(context);
    if (
      !MATCH_VOTE_QUESTIONS.includes(input.question) ||
      !isMatchVoteChoice(input.question, input.choice)
    )
      fail("validation_failed");
    const fixture = FIXTURES.find((candidate) => candidate.id === input.fixtureId);
    if (!fixture) fail("match_vote_unavailable");
    if (!isOpen(fixture, mockServerNow())) fail("match_vote_closed");
    const state = loadState();
    const onFixture = (state.votes[input.fixtureId] ??= {});
    (onFixture[actorId] ??= {})[input.question] = input.choice;
    saveState(state);
    return this.getMatchVotes(input.fixtureId, context);
  }
}
