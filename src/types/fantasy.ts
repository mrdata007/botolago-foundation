// Fantasy domain models. Backend implementations will conform to these;
// UI never references anything else.

import type { LocalizedString, Player } from "@/types/domain";

export type Position = "GK" | "DEF" | "MID" | "FWD";

// Valid Botola-fantasy formations (starting XI = 11)
export type FormationKey = "3-4-3" | "3-5-2" | "4-3-3" | "4-4-2" | "4-5-1" | "5-3-2" | "5-4-1";

export const FORMATIONS: Record<FormationKey, { DEF: number; MID: number; FWD: number }> = {
  "3-4-3": { DEF: 3, MID: 4, FWD: 3 },
  "3-5-2": { DEF: 3, MID: 5, FWD: 2 },
  "4-3-3": { DEF: 4, MID: 3, FWD: 3 },
  "4-4-2": { DEF: 4, MID: 4, FWD: 2 },
  "4-5-1": { DEF: 4, MID: 5, FWD: 1 },
  "5-3-2": { DEF: 5, MID: 3, FWD: 2 },
  "5-4-1": { DEF: 5, MID: 4, FWD: 1 },
};

// Squad composition rules (mockable — a real backend can override).
export const SQUAD_RULES = {
  totalSize: 15,
  perPosition: { GK: 2, DEF: 5, MID: 5, FWD: 3 } as Record<Position, number>,
  maxPerClub: 3,
  startingXI: 11,
  budget: 100.0,
  freeTransfersPerWeek: 1,
  transferHitPoints: 4,
};

export type KitPattern =
  | "solid"
  | "stripes-vertical"
  | "bands-horizontal"
  | "central-stripe"
  | "two-tone-sleeves";

export interface FantasyPlayer extends Player {
  // extra fantasy-only fields
  nextOpponentClubId?: string;
  nextIsHome?: boolean;
  nextFixtureDifficulty?: 1 | 2 | 3 | 4 | 5;
  expectedPoints?: number;
  chanceOfPlaying?: number; // 0-100
  /** Optional pre-rendered jersey image. When present, PlayerShirt uses it with graceful fallback to CSS jersey. */
  jerseyImageUrl?: string;
  /** Optional per-player kit override; otherwise derived from the club. */
  kitPattern?: KitPattern;
  /**
   * The player's approved photo, resolved to a public URL, or null/absent:
   * `PlayerPhoto` then draws the club-shirt silhouette. Only a photo whose
   * signed release still holds today ever arrives here.
   */
  photoUrl?: string | null;
  /**
   * True when `name` is a stand-in wording, not the player's name (an owned
   * player the buying pool no longer lists, SOL-02). A plate then shows it whole
   * instead of cutting it to a "surname", and the picker never offers him.
   */
  placeholder?: boolean;
}

export interface SquadPlayer {
  playerId: string;
  slot: number; // 1..15, 1..11 = XI (in pitch order), 12..15 = bench
  isCaptain?: boolean;
  isViceCaptain?: boolean;
}

export interface FantasyTeam {
  managerName: string;
  teamName: string;
  formation: FormationKey;
  squad: SquadPlayer[]; // length 15
  bank: number;
  freeTransfers: number;
  pendingTransfers: number;
}

export interface TransferDraft {
  out: string[]; // player ids
  in: string[]; // player ids
}

export interface League {
  id: string;
  name: string;
  type: "private" | "public" | "cup";
  members: number;
  rank: number | null;
  previousRank: number | null;
  score: number;
  leaderName?: string;
  code?: string;
  role?: "owner" | "admin" | "member" | "creator";
}

export interface LeagueStanding {
  managerId: string;
  managerName: string;
  teamName: string;
  /** Optional club affiliation used for the crest badge in league tables. */
  clubId?: string;
  rank: number;
  /** The rank this board held before; null when the server has none to give. */
  previousRank: number | null;
  gameweekScore: number;
  totalScore: number;
  /**
   * ISO. When the ranking service calculated this row (the API's
   * `calculatedAt`); absent from the mock board. It is what dates a league's
   * standings (`leagueFreshness`).
   */
  calculatedAt?: string;
}

/**
 * BG-0075 — the scoring categories the ledger actually writes.
 *
 * These are the exact strings `scorePlayerFixture` emits into
 * `app.fantasy_player_point_events.category`
 * (src/backend/fantasy/scoring.ts). The old union here was invented
 * independently of the engine — it had `"60min"`, `"yellow"`, `"red"` and
 * `"conceded"`, none of which the backend has ever written — so nothing could
 * have matched it. The column is free text constrained only by a regex, so
 * `PointsEvent.category` stays a plain string and the UI falls back to the raw
 * code for a category minted after this list.
 */
export const POINTS_EVENT_CATEGORIES = [
  "appearance",
  "goal",
  "assist",
  "clean_sheet",
  "goals_conceded",
  "saves",
  "penalty_save",
  "penalty_miss",
  "yellow_card",
  "red_card",
  "second_yellow_dismissal",
  "own_goal",
  "bonus",
  "player_of_match",
  // The rating rule (docs/backend/FANTASY_RATING_POINTS.md): the only line of a
  // rating gameweek, the SofaScore rating rounded (5 without one).
  "rating",
] as const;

export type PointsEventCategory = (typeof POINTS_EVENT_CATEGORIES)[number];

export interface PointsEvent {
  /** A `POINTS_EVENT_CATEGORIES` member, or a newer server-minted code. */
  category: string;
  points: number;
  /** The fixture the line was scored in; a double gameweek has two. */
  fixtureId?: string;
}

/**
 * Who a player is, as the server describes him in a round's result
 * (`api.get_my_fantasy_points`, migration 20261015120300). It lets an old round
 * name a player who has since left today's buying pool. It is the player's
 * current catalogue row, not a copy taken in that round: a player who
 * transferred since shows his current club. Absent when the server does not
 * send it yet.
 */
export interface PlayerRoundIdentity {
  name: string;
  position: Position;
  clubId: string;
  teamName: string;
  teamShortName: string;
}

export interface PlayerPointsBreakdown {
  multiplier?: number;
  playerId: string;
  identity?: PlayerRoundIdentity;
  totalPoints: number;
  minutesPlayed: number;
  /** The server distinguishes missing ratings from a confirmed zero. */
  ratingPending?: boolean;
  /** At least one appearance settled under the audited short-appearance rule. */
  notRated?: boolean;
  pointsKnown?: boolean;
  isCaptain?: boolean;
  isViceCaptain?: boolean;
  isBench?: boolean;
  status: "provisional" | "live" | "final";
  fixtureScoring?: Array<{
    estimated?: boolean;
    fixtureId: string;
    teamIds?: string[];
    mode: "full" | "simple" | null;
    pending: boolean;
  }>;
  events: PointsEvent[];
}

export interface GameweekResult {
  authoritative?: {
    ratingPublication?: {
      historicalRevision: boolean;
      pending: boolean;
      pendingFixtures: number;
      sourceUpdatedAt: string | null;
    };
    startingIds: string[];
    benchIds: string[];
    effectiveCaptainId: string | null;
    captainMultiplier: number;
    captainPoints: number;
    transferHit: number;
    chipType: "wildcard" | "free_hit" | "bench_boost" | "triple_captain" | null;
    incremental: boolean;
    finalized: boolean;
    /**
     * The gameweek closed on provisional points (the next one is open) and is not
     * locked yet: SofaScore's detailed statistics may still change these points.
     */
    closedProvisional?: boolean;
    /** Starters' points as the server counted them (substitutions applied, no captain bonus). */
    startingPoints: number;
    /** The final score once finalized, else null; `totalPoints` falls back to the provisional one. */
    finalScore: number | null;
    /** The gameweek's lifecycle status; "corrected" after an authoritative correction. */
    gameweekStatus: string;
    /** The scoring calculation that produced these figures. */
    calculationVersion: number;
    /** When the server finalized this result (ISO), or null while it is not final. */
    finalizedAt: string | null;
  };
  gameweek: number;
  totalPoints: number; // includes captain multiplier
  benchPoints: number;
  captainId?: string;
  /**
   * BG-0075 — the gameweek-wide figures behind the Average / Highest strip.
   * `null` means "nobody has been scored yet", which the points page renders as
   * an em dash. It is never 0: a 0 would read as "every manager scored
   * nothing".
   */
  averagePoints?: number | null;
  highestPoints?: number | null;
  /**
   * BG-0075 — `reasonKey` is the server's reason code
   * (`app.fantasy_auto_substitutions.reason`, a `[a-z][a-z0-9_]*` slug), not
   * prose. The UI translates it; it was previously typed as a `LocalizedString`
   * that no backend has ever been able to supply.
   */
  autoSubs: { outId: string; inId: string; reasonKey: string }[];
  breakdown: PlayerPointsBreakdown[];
}

export interface FixtureDifficulty {
  clubId: string;
  gameweek: number;
  opponentClubId: string;
  isHome: boolean;
  difficulty: 1 | 2 | 3 | 4 | 5;
  isDouble?: boolean;
  isBlank?: boolean;
  /** Kickoff of the underlying fixture when the source exposes it. */
  kickoffAt?: string;
}

// Weekly top-performer entry — powers the "Top 5 players of the week" screen.
export interface TopPlayerOfWeek {
  playerId: string;
  rank: 1 | 2 | 3 | 4 | 5;
  gameweek: number;
  weeklyPoints: number;
  /**
   * `null` = the source does not report this statistic for the gameweek, so
   * it is unknown. A real 0 stays 0. Never substitute 0 for unknown.
   */
  goals: number | null;
  assists: number | null;
  cleanSheets: number | null;
  minutes: number;
  price: number;
  ownershipPercent: number;
  /** BG-0071 — see `Player.form`: `null` when no gameweek has scored yet. */
  form: number | null;
}
