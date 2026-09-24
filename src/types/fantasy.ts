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
  /**
   * The last four characters of a private league's current invite code. The
   * full code is stored only as a digest and cannot be shown again; the hint
   * lets an owner tell whether the code they shared is still the live one.
   */
  inviteCodeHint?: string;
  role?: "owner" | "admin" | "member" | "creator";
}

export interface LeagueStanding {
  managerId: string;
  managerName: string;
  teamName: string;
  /** Optional club affiliation used for the crest badge in league tables. */
  clubId?: string;
  rank: number;
  previousRank: number;
  gameweekScore: number;
  totalScore: number;
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
] as const;

export type PointsEventCategory = (typeof POINTS_EVENT_CATEGORIES)[number];

export interface PointsEvent {
  /** A `POINTS_EVENT_CATEGORIES` member, or a newer server-minted code. */
  category: string;
  points: number;
  /** The fixture the line was scored in; a double gameweek has two. */
  fixtureId?: string;
}

export interface PlayerPointsBreakdown {
  playerId: string;
  totalPoints: number;
  minutesPlayed: number;
  isCaptain?: boolean;
  isViceCaptain?: boolean;
  isBench?: boolean;
  status: "provisional" | "live" | "final";
  events: PointsEvent[];
}

export interface GameweekResult {
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
  goals: number;
  assists: number;
  cleanSheets: number;
  minutes: number;
  price: number;
  ownershipPercent: number;
  /** BG-0071 — see `Player.form`: `null` when no gameweek has scored yet. */
  form: number | null;
}
