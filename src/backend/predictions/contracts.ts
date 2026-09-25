import { z } from "zod";
import type { RepositoryContext } from "@/backend/contracts/repository";
import { postgresUuidSchema } from "@/backend/contracts/validation";
import {
  FIXTURE_STATUSES,
  teamSummarySchema,
  type FootballLanguage,
} from "@/backend/football/contracts";

/**
 * Pronostics (score predictions, BG-0146): the DTOs of the `api.*` functions
 * in supabase/migrations/20260925090200_predictions_api.sql,
 * 20260925090300_predictions_leagues.sql and 20260925234000_match_votes.sql.
 *
 * The shapes are the whole contract: a key the database starts returning is
 * dropped by the parse rather than shown, and a key it stops returning fails
 * loudly instead of rendering as undefined. The only times here are the
 * database's; the phone never sends one.
 */

const uuid = postgresUuidSchema;
const timestamp = z.string().datetime({ offset: true });
const count = z.number().int().nonnegative();
/** A predicted score: what `api.save_predictions` accepts (0-20 per side). */
const goals = z.number().int().min(0).max(20);
/** A match score as the provider reports it. */
const score = z.number().int().nonnegative();

export const PREDICTIONS_MODES = ["off", "testers", "public"] as const;
export type PredictionsMode = (typeof PREDICTIONS_MODES)[number];

/** `app_private.prediction_round_state`. */
export const ROUND_STATES = ["upcoming", "in_progress", "provisional", "completed"] as const;
export type RoundState = (typeof ROUND_STATES)[number];

/** `app.predictions.result_kind`: late and void score nothing. */
export const RESULT_KINDS = ["exact", "outcome", "miss", "void", "late"] as const;
export type ResultKind = (typeof RESULT_KINDS)[number];

/** Most goals the steppers offer. The database accepts up to 20. */
export const MAX_STEPPER_GOALS = 9;
/** `app_private.prediction_settings.max_items_per_save`. */
export const MAX_ITEMS_PER_SAVE = 16;
/** `app_private.prediction_settings.max_claim_items`. */
export const MAX_CLAIM_ITEMS = 40;

export const scorePairSchema = z.object({ home: score, away: score });
export type ScorePair = z.infer<typeof scorePairSchema>;

// ---------------------------------------------------------------------------
// api.predictions_round
// ---------------------------------------------------------------------------

export const predictionFixtureSchema = z.object({
  id: uuid,
  kickoffAt: timestamp,
  /** False for the provider's 00:00 UTC placeholder: "Horaire à confirmer". */
  kickoffConfirmed: z.boolean(),
  status: z.enum(FIXTURE_STATUSES),
  /** The database's answer, against its own clock, when the journée was read. */
  open: z.boolean(),
  home: teamSummarySchema,
  away: teamSummarySchema,
  /** The running score, only while the match is being played. */
  live: scorePairSchema.nullable(),
  /** Only once the match is final (finished and finalized). */
  result: scorePairSchema.nullable(),
  final: z.boolean(),
  void: z.boolean(),
  corrected: z.boolean(),
});
export type PredictionFixtureDto = z.infer<typeof predictionFixtureSchema>;

export const predictionRoundSchema = z.object({
  id: uuid,
  number: z.number().int().positive(),
  name: z.string(),
  state: z.enum(ROUND_STATES),
  provisional: z.boolean(),
  nextLockAt: timestamp.nullable(),
  /** Grows whenever a match of the journée is (re)scored: a cache key. */
  scoringVersion: count,
});
export type PredictionRoundDto = z.infer<typeof predictionRoundSchema>;

export const roundSummarySchema = z.object({
  number: z.number().int().positive(),
  state: z.enum(ROUND_STATES),
});
export type RoundSummaryDto = z.infer<typeof roundSummarySchema>;

const closedRoundSchema = z.object({
  schemaVersion: z.literal(1),
  mode: z.enum(PREDICTIONS_MODES),
  allowed: z.literal(false),
  serverTime: timestamp,
});

const openRoundSchema = z.object({
  schemaVersion: z.literal(1),
  mode: z.enum(PREDICTIONS_MODES),
  allowed: z.literal(true),
  serverTime: timestamp,
  season: z.object({ id: uuid, label: z.string() }).nullable(),
  round: predictionRoundSchema.nullable(),
  rounds: z.array(roundSummarySchema),
  fixtures: z.array(predictionFixtureSchema),
});

export const predictionsRoundResponseSchema = z.discriminatedUnion("allowed", [
  closedRoundSchema,
  openRoundSchema,
]);
export type PredictionsRoundDto = z.infer<typeof predictionsRoundResponseSchema>;
export type OpenPredictionsRoundDto = z.infer<typeof openRoundSchema>;

// ---------------------------------------------------------------------------
// api.my_predictions
// ---------------------------------------------------------------------------

export const myPredictionSchema = z.object({
  fixtureId: uuid,
  home: goals,
  away: goals,
  submittedAt: timestamp,
  points: count.nullable(),
  resultKind: z.enum(RESULT_KINDS).nullable(),
});
export type MyPredictionDto = z.infer<typeof myPredictionSchema>;

export const myPredictionsSummarySchema = z.object({
  predicted: count,
  total: count,
  points: count,
  exact: count,
  rank: z.number().int().positive().nullable(),
  seasonPoints: count,
  seasonRank: z.number().int().positive().nullable(),
  roundsPlayed: count,
});
export type MyPredictionsSummaryDto = z.infer<typeof myPredictionsSummarySchema>;

export const myPredictionsResponseSchema = z.object({
  serverTime: timestamp,
  items: z.array(myPredictionSchema),
  summary: myPredictionsSummarySchema.nullable(),
});
export type MyPredictionsDto = z.infer<typeof myPredictionsResponseSchema>;

// ---------------------------------------------------------------------------
// api.save_predictions / api.claim_guest_predictions
// ---------------------------------------------------------------------------

export interface PredictionInput {
  readonly fixtureId: string;
  readonly home: number;
  readonly away: number;
}

/** A guest's pick, with the teams the guest saw (so a home/away swap maps). */
export interface GuestClaimInput extends PredictionInput {
  readonly homeTeamId: string;
  readonly awayTeamId: string;
}

export const SAVE_STATUSES = ["saved", "unchanged", "locked", "not_eligible"] as const;
export type SaveStatus = (typeof SAVE_STATUSES)[number];

export const saveResultSchema = z.object({
  fixtureId: uuid,
  status: z.enum(SAVE_STATUSES),
  /** What the account holds for the match after the call (null: nothing). */
  home: goals.nullable(),
  away: goals.nullable(),
  submittedAt: timestamp.nullable(),
});
export type SaveResultDto = z.infer<typeof saveResultSchema>;

export const savePredictionsResponseSchema = z.object({
  serverTime: timestamp,
  results: z.array(saveResultSchema),
});
export type SavePredictionsDto = z.infer<typeof savePredictionsResponseSchema>;

export const CLAIM_STATUSES = ["imported", "kept", "started", "invalid"] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

export const claimGuestPredictionsResponseSchema = z.object({
  serverTime: timestamp,
  imported: count,
  keptExisting: count,
  started: count,
  invalid: count,
  results: z.array(z.object({ fixtureId: uuid, status: z.enum(CLAIM_STATUSES) })),
});
export type ClaimGuestPredictionsDto = z.infer<typeof claimGuestPredictionsResponseSchema>;

// ---------------------------------------------------------------------------
// api.predictions_leaderboard
// ---------------------------------------------------------------------------

export const LEADERBOARD_SCOPES = ["round", "season"] as const;
export type LeaderboardScope = (typeof LEADERBOARD_SCOPES)[number];

export const leaderboardCursorSchema = z.object({ rank: z.number().int().positive(), id: uuid });
export type LeaderboardCursor = z.infer<typeof leaderboardCursorSchema>;

export const leaderboardEntrySchema = z.object({
  /** The standing row's id (the cursor's tie-breaker), never an account id. */
  id: uuid,
  rank: z.number().int().positive(),
  tied: z.boolean(),
  /** Display name for signed-in viewers, masked username for visitors. */
  name: z.string().nullable(),
  points: count,
  exact: count,
  roundsPlayed: count.nullable(),
  isMe: z.boolean(),
});
export type LeaderboardEntryDto = z.infer<typeof leaderboardEntrySchema>;

export const leaderboardMeSchema = z.object({
  rank: z.number().int().positive().nullable(),
  points: count,
  exact: count,
  roundsPlayed: count.nullable().optional(),
});

const closedLeaderboardSchema = z.object({
  allowed: z.literal(false),
  mode: z.enum(PREDICTIONS_MODES),
});

const openLeaderboardSchema = z.object({
  allowed: z.literal(true),
  scope: z.enum(LEADERBOARD_SCOPES),
  /** Absent when there is no season or journée to rank yet. */
  round: z.number().int().positive().nullable().optional(),
  provisional: z.boolean().nullable().optional(),
  matchesLeft: count.nullable().optional(),
  /** Counted on the first page only. */
  total: count.nullable(),
  items: z.array(leaderboardEntrySchema),
  nextCursor: leaderboardCursorSchema.nullable(),
  me: leaderboardMeSchema.nullable(),
});

export const leaderboardResponseSchema = z.discriminatedUnion("allowed", [
  closedLeaderboardSchema,
  openLeaderboardSchema,
]);
export type LeaderboardDto = z.infer<typeof leaderboardResponseSchema>;
export type OpenLeaderboardDto = z.infer<typeof openLeaderboardSchema>;

// ---------------------------------------------------------------------------
// Leagues (one league, two games)
// ---------------------------------------------------------------------------

export const LEAGUE_VIAS = ["fantasy", "predictions"] as const;
export type LeagueVia = (typeof LEAGUE_VIAS)[number];

export const joinLeagueResponseSchema = z.object({
  leagueId: uuid,
  name: z.string(),
  /** False when already a member (through either game). */
  joined: z.boolean(),
  via: z.enum(LEAGUE_VIAS),
});
export type JoinLeagueDto = z.infer<typeof joinLeagueResponseSchema>;

export const leaveLeagueResponseSchema = z.object({ leagueId: uuid, left: z.literal(true) });
export type LeaveLeagueDto = z.infer<typeof leaveLeagueResponseSchema>;

export const myLeagueSchema = z.object({
  leagueId: uuid,
  name: z.string(),
  via: z.enum(LEAGUE_VIAS),
  role: z.enum(["owner", "member"]),
  members: count,
  /** The last 4 characters of the code, for its owner only. */
  inviteCodeHint: z.string().nullable(),
  seasonPoints: count,
});
export type MyLeagueDto = z.infer<typeof myLeagueSchema>;

export const myLeaguesResponseSchema = z.object({ items: z.array(myLeagueSchema) });
export type MyLeaguesDto = z.infer<typeof myLeaguesResponseSchema>;

export const leagueStandingEntrySchema = z.object({
  rank: z.number().int().positive(),
  tied: z.boolean(),
  name: z.string().nullable(),
  points: count,
  exact: count,
  roundsPlayed: count.nullable(),
  isMe: z.boolean(),
});
export type LeagueStandingEntryDto = z.infer<typeof leagueStandingEntrySchema>;

export const leagueStandingsResponseSchema = z.object({
  league: z.object({
    id: uuid,
    name: z.string(),
    isOwner: z.boolean(),
    inviteCodeHint: z.string().nullable(),
  }),
  scope: z.enum(LEADERBOARD_SCOPES),
  round: z.number().int().positive().nullable(),
  items: z.array(leagueStandingEntrySchema),
  members: count,
  /** Members with nothing scored yet in this scope: counted, not ranked. */
  notPlayed: count,
});
export type LeagueStandingsDto = z.infer<typeof leagueStandingsResponseSchema>;

/** 16 random bytes, hex, upper case: the code `api.create_fantasy_league` mints too. */
export const INVITE_CODE_PATTERN = /^[0-9A-F]{32}$/;

export const createLeagueResponseSchema = z.object({
  leagueId: uuid,
  name: z.string(),
  /** Returned once; null when a double tap returned the league just created. */
  inviteCode: z.string().regex(INVITE_CODE_PATTERN).nullable(),
  created: z.boolean(),
});
export type CreateLeagueDto = z.infer<typeof createLeagueResponseSchema>;

export const resetInviteCodeResponseSchema = z.object({
  leagueId: uuid,
  inviteCode: z.string().regex(INVITE_CODE_PATTERN),
});
export type ResetInviteCodeDto = z.infer<typeof resetInviteCodeResponseSchema>;

/** League names: the rule `app.fantasy_leagues` enforces. */
export const LEAGUE_NAME_MIN = 3;
export const LEAGUE_NAME_MAX = 80;

// ---------------------------------------------------------------------------
// api.match_votes / api.cast_match_vote (20260925234000): fan votes, for fun
// ---------------------------------------------------------------------------

/** The three questions, in the order the database answers them. */
export const MATCH_VOTE_QUESTIONS = ["winner", "both_score", "first_goal"] as const;
export type MatchVoteQuestion = (typeof MATCH_VOTE_QUESTIONS)[number];

/** Each question's answers, in display order (home first: on the right in Arabic). */
export const MATCH_VOTE_CHOICES = {
  winner: ["home", "draw", "away"],
  both_score: ["yes", "no"],
  first_goal: ["home", "none", "away"],
} as const satisfies Record<MatchVoteQuestion, readonly string[]>;
export type MatchVoteChoice = (typeof MATCH_VOTE_CHOICES)[MatchVoteQuestion][number];

export function isMatchVoteChoice(question: MatchVoteQuestion, choice: string): boolean {
  return (MATCH_VOTE_CHOICES[question] as readonly string[]).includes(choice);
}

const winnerVoteSchema = z.object({
  question: z.literal("winner"),
  counts: z.object({ home: count, draw: count, away: count }),
  mine: z.enum(MATCH_VOTE_CHOICES.winner).nullable(),
});
const bothScoreVoteSchema = z.object({
  question: z.literal("both_score"),
  counts: z.object({ yes: count, no: count }),
  mine: z.enum(MATCH_VOTE_CHOICES.both_score).nullable(),
});
const firstGoalVoteSchema = z.object({
  question: z.literal("first_goal"),
  counts: z.object({ home: count, none: count, away: count }),
  mine: z.enum(MATCH_VOTE_CHOICES.first_goal).nullable(),
});
export const matchVoteQuestionSchema = z.discriminatedUnion("question", [
  winnerVoteSchema,
  bothScoreVoteSchema,
  firstGoalVoteSchema,
]);
export type MatchVoteQuestionDto = z.infer<typeof matchVoteQuestionSchema>;

const closedMatchVotesSchema = z.object({
  schemaVersion: z.literal(1),
  allowed: z.literal(false),
  serverTime: timestamp,
});

const openMatchVotesSchema = z.object({
  schemaVersion: z.literal(1),
  allowed: z.literal(true),
  serverTime: timestamp,
  fixtureId: uuid,
  /** A match Pronostics covers: the current season, with a journée. */
  covered: z.boolean(),
  /** Votes can still change: the match has not kicked off. */
  open: z.boolean(),
  questions: z.array(matchVoteQuestionSchema),
});

export const matchVotesResponseSchema = z.discriminatedUnion("allowed", [
  closedMatchVotesSchema,
  openMatchVotesSchema,
]);
export type MatchVotesDto = z.infer<typeof matchVotesResponseSchema>;
export type OpenMatchVotesDto = z.infer<typeof openMatchVotesSchema>;

export interface MatchVoteInput {
  readonly fixtureId: string;
  readonly question: MatchVoteQuestion;
  readonly choice: MatchVoteChoice;
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export interface RoundRequest {
  readonly roundNumber: number | null;
  readonly language: FootballLanguage;
}

export interface MyPredictionsRequest {
  readonly roundNumber: number | null;
  readonly fixtureId: string | null;
}

export interface LeaderboardRequest {
  readonly scope: LeaderboardScope;
  readonly roundNumber: number | null;
  readonly cursor: LeaderboardCursor | null;
  readonly limit: number;
}

export interface PredictionsRepository {
  getRound(input: RoundRequest, context: RepositoryContext): Promise<PredictionsRoundDto>;
  getMyPredictions(
    input: MyPredictionsRequest,
    context: RepositoryContext,
  ): Promise<MyPredictionsDto>;
  savePredictions(
    items: readonly PredictionInput[],
    context: RepositoryContext,
  ): Promise<SavePredictionsDto>;
  claimGuestPredictions(
    items: readonly GuestClaimInput[],
    context: RepositoryContext,
  ): Promise<ClaimGuestPredictionsDto>;
  getLeaderboard(input: LeaderboardRequest, context: RepositoryContext): Promise<LeaderboardDto>;
  listMyLeagues(context: RepositoryContext): Promise<MyLeaguesDto>;
  getLeagueStandings(
    input: { readonly leagueId: string; readonly roundNumber: number | null },
    context: RepositoryContext,
  ): Promise<LeagueStandingsDto>;
  joinLeague(inviteCode: string, context: RepositoryContext): Promise<JoinLeagueDto>;
  leaveLeague(leagueId: string, context: RepositoryContext): Promise<LeaveLeagueDto>;
  createLeague(name: string, context: RepositoryContext): Promise<CreateLeagueDto>;
  resetLeagueInviteCode(leagueId: string, context: RepositoryContext): Promise<ResetInviteCodeDto>;
  getMatchVotes(fixtureId: string, context: RepositoryContext): Promise<MatchVotesDto>;
  castMatchVote(input: MatchVoteInput, context: RepositoryContext): Promise<MatchVotesDto>;
}
