/**
 * Render-facing types for the Manager Card (Curva). Verbatim from
 * docs/product/MANAGER_CARD_SECTION_PLAN.md section 6.2. Every field may be empty;
 * empty draws as the object's own empty part (never 0, never a lock).
 */
import type { HistoryRowDto } from "@/backend/manager-card/contracts";

export const TIER_CODES = ["homa", "stade", "pro", "champion", "legend"] as const;
export type TierCode = (typeof TIER_CODES)[number];
export const STAT_CODES = ["cap", "sel", "trf", "con"] as const;
export type StatCode = (typeof STAT_CODES)[number];
export type CardLang = "fr" | "ar";
export type CardTheme = "light" | "dark";
export type BeatName = "make" | "tick" | "first" | "tier" | "legend" | "founder" | "castoff";
export type TokenSize = 24 | 28 | 32 | 44 | 56 | 64 | 80;

export interface CardClub {
  id: string;
  /** Two or three letters for discs: the club code, else from the short name. */
  initials: string;
  name: { fr: string; ar: string };
  /** `#rrggbb` from `clubPalette(club).base`; never a literal in a component. */
  primary: string;
  /** `#rrggbb` from `clubPalette(club).secondary`, or null. */
  secondary: string | null;
  /** The club's slug, for finding it in the app's club catalogue when the ids differ (development). */
  slug?: string | null;
  /**
   * The club's crest picture, set by the app only once it has loaded in this browser
   * (`useCardCrest`): the renderer draws it on a light plate in the tab's disc instead of the
   * initials. Absent: the initials disc. A renderer draws only an `https:` URL, a local `http:` one
   * or a raster `data:image` (`crestHref`); anything else reads as absent.
   */
  crest?: string;
}

/** What a renderer draws. Every field may be empty; empty draws as the object's own empty part. */
export interface CardProfile {
  /** Display name, else team name (D17). "" for an unnamed guest: an empty name band. */
  name: string;
  /** null: a dash on the number carrier, never 0. */
  ovr: number | null;
  /** null: the base material with no tier word. Never HOMA before a rating. */
  tier: TierCode | null;
  /** No change to the art; the app shows the « Provisoire » pill beside it. */
  provisional: boolean;
  /** Counted journées and the minimum: k of N marks while forming. null: no marks. */
  counted: number | null;
  minRated: number | null;
  /** "2026/27". */
  season: string;
  /** "482913" (no prefix, no leading zero) or null: a dash on the ID carrier. */
  serial: string | null;
  /** 2026 or null: no founder part at all. */
  founder: number | null;
  club: CardClub | null;
  stats: Record<StatCode, number | null>;
  /**
   * true: `stats` are the server's values for this card and season, so an empty one is really
   * empty. Absent or false: the stats are placeholders (an earlier season's token, which the
   * server sends no stats for), and nothing may be said about how many are filled.
   */
  statsKnown?: boolean;
  /** Development fixtures only: prints the sample label on the object. */
  sample?: true;
  /**
   * The tier ladder's token: draw the material of `tier` although there is no number (a dash), so
   * five tokens in a row show five materials. A card that carries a rating never needs it.
   */
  ladder?: true;
}

/** The words a renderer may print or speak, from the app dictionary (WP1 `cardStrings`). */
export interface CardStrings {
  lang: CardLang;
  ovr: string; // "OVR"
  stats: Record<StatCode, string>; // CAP… / القائد…
  statsLong: Record<StatCode, string>;
  tiers: Record<TierCode, string>;
  founderLine: string; // « Fondateur 2026 »
  sample: string; // « Exemple » / «مثال»
  serial: (serial: string) => string; // "BOT #482913"
  a11y: {
    cardOf: string;
    noRating: string;
    counted: (k: number, n: number) => string;
    /**
     * « Statistiques remplies : 2 sur 4 », bare digits: said instead of the journée count when
     * every journée is counted and the number waits for a statistic. Optional, so a renderer's
     * own strings need not carry it; without it the label says the journée count.
     */
    statsFilled?: (k: number, n: number) => string;
    separator: string; // ", " / "، "
  };
}

/* ------------------------------------------------------------------------------------------------
   Moment types (plan sections 5.3 and 7.6, verbatim). The DTO types they name are the `z.infer`
   of the schemas in `src/backend/manager-card/contracts.ts`.
   ------------------------------------------------------------------------------------------------ */

export type HeroKind =
  | "born_new"
  | "born_arrival"
  | "first_fresh"
  | "first_arrival"
  | "first_coalesced"
  | "tier_up"
  | "founder"
  | "season_closed";
export interface HeroSpec {
  kind: HeroKind;
  /** Every moment key this hero acknowledges, in one call. */
  keys: string[];
  beat: BeatName | null;
  gameweekSeq: number | null;
  tier: TierCode | null;
  /** first_coalesced only: the first rating it folds in. */
  first: { ovr: number; gameweekSeq: number } | null;
}
export interface LineSpec {
  kind: "provisional_cleared" | "season_started" | "tier_down";
  /** Acknowledged on display; [] for tier_down (never a moment). */
  keys: string[];
}
export interface ReplayItem {
  kind: "first_rating" | "tier" | "founder" | "season";
  seasonId: string | null;
  gameweekSeq: number | null;
  tier: TierCode | null;
  beat: BeatName | null;
  /** The stored journée the replay draws; null for founder (drawn from the current card). */
  row: HistoryRowDto | null;
}
