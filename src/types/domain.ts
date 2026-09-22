// Typed domain models for BotolaGO.
// Backend implementations will conform to these; UI never references anything else.

export type Language = "fr" | "ar";

export type LocalizedString = Record<Language, string>;

export interface Club {
  id: string;
  /**
   * The provider-stable slug (`app.clubs.slug`), when the presenter has one.
   *
   * BG-0111 — Fantasy fixture rows and the football club list are produced by
   * two repositories. In cloud mode both key on the same club UUID; the mock
   * football repository mints synthetic UUIDs while the Fantasy mocks key on
   * the source slug ("war", "rca"), so an id-only join silently resolves to
   * nothing and the pitch renders a fixture with no opponent. Carrying the
   * slug lets a presenter match on either key without guessing.
   */
  slug?: string;
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
  /**
   * Whether `kickoff` has stopped describing a real date.
   *
   * Four provider statuses collapse into the single domain `postponed` --
   * postponed, cancelled, suspended and abandoned -- and only the first two
   * mean "this has not happened and nobody knows when". A suspended or
   * abandoned fixture DID kick off, at the stored instant, so its date is
   * history and has to survive. Set by the presenter that still holds the
   * provider status; where it is absent (the mock fixtures)
   * `isKickoffDateUnconfirmed` falls back to the domain status.
   */
  dateUnconfirmed?: boolean;
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
  /**
   * BG-0075 — the gameweek-wide average and highest team score. `null` while no
   * team has been scored; never 0, which would read as "everybody scored
   * nothing". Populated from `api.fantasy_gameweek_summary`.
   */
  averagePoints: number | null;
  highestPoints: number | null;
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
