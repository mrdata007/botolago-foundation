/**
 * Render-facing types for the Manager Card (Gradins). Verbatim from
 * docs/product/MANAGER_CARD_SECTION_PLAN.md section 6.2. Every field may be empty;
 * empty draws as the object's own empty part (never 0, never a lock).
 */
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
  /** Development fixtures only: prints the sample label on the object. */
  sample?: true;
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
    separator: string; // ", " / "، "
  };
}
