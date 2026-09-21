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
  /** Validated provider URL or a resolved public football-media object URL. */
  crestUrl?: string;
}

export interface Player {
  id: string;
  name: LocalizedString;
  clubId: string;
  position: "GK" | "DEF" | "MID" | "FWD";
  price: number; // millions
  totalPoints: number;
  /**
   * BG-0071 — mean points over the last 5 scored gameweeks of the season, to
   * one decimal. `null` means NO gameweek has scored yet and is rendered as a
   * dash (`fantasy.stat.none`), never as `0.0`: a player who genuinely scored
   * 0 in the window reads a real `0` and the two must not look alike.
   */
  form: number | null;
  ownership: number; // %
  status: "available" | "injured" | "doubtful" | "suspended";
}

export type ArticleCategory = "for_you" | "latest" | "transfers" | "analysis" | "interviews";

export interface Article {
  id: string;
  /** Actual edition language; omitted only by bilingual preview fixtures. */
  language?: Language;
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
  /** Editorial alt text supplied alongside the hero media. */
  heroAlt?: string;
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

export type FantasyGameweekStatus =
  | "scheduled"
  | "open"
  | "locked"
  | "live"
  | "provisional"
  | "finalizing"
  | "finalized"
  | "corrected"
  | "cancelled";

export type FantasyPointsState = "provisional" | "final";

export interface Gameweek {
  number: number;
  deadline: string; // ISO
  isCurrent: boolean;
  name?: string;
  status?: FantasyGameweekStatus;
  pointsState?: FantasyPointsState;
  rankingAvailable?: boolean;
  averagePoints: number;
  highestPoints: number;
  chipActive?: LocalizedString;
}

export interface FantasySummary {
  managerName: string;
  teamName: string;
  totalPoints: number;
  gameweekPoints: number;
  overallRank: number | null;
  gameweekRank: number | null;
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
