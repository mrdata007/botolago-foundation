// Typed domain models for BotolaGO.
// Backend implementations will conform to these; UI never references anything else.

export type Language = "fr" | "ar";

export type LocalizedString = Record<Language, string>;

export interface Club {
  id: string;
  name: LocalizedString;
  shortName: LocalizedString;
  city: LocalizedString;
  primaryColor: string;
  /** Optional second club color used for jersey patterns. Falls back to a derived tone. */
  secondaryColor?: string;
  crestPlaceholder: string; // 2-3 letter abbreviation
}

export interface Player {
  id: string;
  name: LocalizedString;
  clubId: string;
  position: "GK" | "DEF" | "MID" | "FWD";
  price: number; // millions
  totalPoints: number;
  form: number;
  ownership: number; // %
  status: "available" | "injured" | "doubtful" | "suspended";
}

export type ArticleCategory = "for_you" | "latest" | "transfers" | "analysis" | "interviews";

export interface Article {
  id: string;
  title: LocalizedString;
  excerpt: LocalizedString;
  category: ArticleCategory;
  clubIds: string[];
  authorName: LocalizedString;
  publishedAt: string; // ISO
  readMinutes: number;
  heroGradient: string; // CSS gradient string
  /** Trusted media URL supplied by the V2 News read model. */
  heroUrl?: string;
  /** Sanitized server-authored HTML, present only on article detail. */
  bodyHtml?: string;
  isLead?: boolean;
  tag?: LocalizedString;
}

export type MatchStatus = "scheduled" | "live" | "finished" | "postponed";

export interface Match {
  id: string;
  gameweek: number;
  homeClubId: string;
  awayClubId: string;
  kickoff: string; // ISO
  status: MatchStatus;
  minute?: number;
  homeScore?: number;
  awayScore?: number;
  venue: LocalizedString;
}

export interface TableRow {
  position: number;
  clubId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalDifference: number;
  points: number;
  form: ("W" | "D" | "L")[];
}

export interface Gameweek {
  number: number;
  deadline: string; // ISO
  isCurrent: boolean;
  averagePoints: number;
  highestPoints: number;
  chipActive?: LocalizedString;
}

export interface FantasySummary {
  managerName: string;
  teamName: string;
  totalPoints: number;
  gameweekPoints: number;
  overallRank: number;
  gameweekRank: number;
  transfersLeft: number;
  bankValue: number;
  teamValue: number;
}

export interface FantasyAlert {
  id: string;
  playerId: string;
  severity: "info" | "warning" | "critical";
  message: LocalizedString;
}

export interface PrivateLeague {
  id: string;
  name: string;
  members: number;
  rank: number;
  previousRank: number;
}
