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
  news?: LocalizedString;
  chanceOfPlaying?: number; // 0-100
  /** Raw active-team selection count when the backend does not expose a percentage. */
  selectionCount?: number;
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

export type PointsEventKind =
  | "appearance"
  | "60min"
  | "goal"
  | "assist"
  | "clean_sheet"
  | "yellow"
  | "red"
  | "penalty_save"
  | "penalty_miss"
  | "own_goal"
  | "conceded"
  | "saves"
  | "bonus";

export interface PointsEvent {
  kind: PointsEventKind;
  points: number;
  count?: number;
}

export interface PlayerPointsBreakdown {
  playerId: string;
  totalPoints: number;
  /** Authoritative backend multiplier when points are server-calculated. */
  multiplier?: number;
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
  /** Authoritative server scoring components when available. */
  startingPoints?: number;
  captainPoints?: number;
  transferHitPoints?: number;
  activeChip?: "wildcard" | "free_hit" | "bench_boost" | "triple_captain";
  finalized?: boolean;
  finalizedAt?: string;
  captainId?: string;
  averagePoints?: number;
  highestPoints?: number;
  autoSubs: { outId: string; inId: string; reason: LocalizedString }[];
  breakdown: PlayerPointsBreakdown[];
}

export interface FixtureDifficulty {
  clubId: string;
  gameweek: number;
  opponentClubId: string;
  /** Authoritative fixture kickoff returned by the difficulty API. */
  kickoffAt?: string;
  isHome: boolean;
  difficulty: 1 | 2 | 3 | 4 | 5;
  isDouble?: boolean;
  isBlank?: boolean;
}

// Weekly top-performer entry — powers the "Top 5 players of the week" screen.
export interface TopPlayerOfWeek {
  playerId: string;
  rank: 1 | 2 | 3 | 4 | 5;
  gameweek: number;
  weeklyPoints: number;
  goals?: number;
  assists?: number;
  cleanSheets?: number;
  minutes: number;
  price?: number;
  ownershipPercent?: number;
  form?: number;
}
