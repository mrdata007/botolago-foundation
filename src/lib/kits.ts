import type { Club, LocalizedString } from "@/types/domain";
import type { KitPattern } from "@/types/fantasy";

import { contrastRatio, parseHex } from "./colour";

export interface KitConfig {
  pattern: KitPattern;
  primary: string;
  secondary: string;
  /**
   * Text/number colour on `primary`, chosen by WCAG contrast — see `inkOn`.
   * It used to be a hand-set value per club, or a YIQ ≥ 150 guess when there
   * was none, and neither is a contrast measurement: both put white on
   * Hassania's red-orange (4.24:1) and Berkane's red (4.17:1). Nothing reads
   * it today — `JerseyVisual` paints the shirt only — but it is correct now.
   */
  ink: string;
}

/** A kit as the tables hold it: the shirt, not the text printed on it. */
export type KitColours = Omit<KitConfig, "ink">;

/**
 * Deterministic per-club kit configuration. Keeps club → visual jersey
 * mapping outside JSX so real Botola kit assets can replace this later
 * (via FantasyPlayer.jerseyImageUrl) without touching UI code.
 *
 * Keyed by the club's id AND its slug (see `findClubKit`): the Fantasy mocks
 * use these strings as ids, while the mock football repository mints UUID ids
 * and carries these strings as the slug. Matching on the id alone sent every
 * mock-football club to the name-fragment fallback below.
 */
const OVERRIDES: Record<string, KitColours> = {
  war: { pattern: "solid", primary: "#c8102e", secondary: "#ffffff" },
  rca: { pattern: "solid", primary: "#0a8f3a", secondary: "#ffffff" },
  asfar: { pattern: "central-stripe", primary: "#1a3a7a", secondary: "#c8102e" },
  fus: { pattern: "stripes-vertical", primary: "#f28e00", secondary: "#111111" },
  rsb: { pattern: "central-stripe", primary: "#e63946", secondary: "#ffffff" },
  mat: { pattern: "bands-horizontal", primary: "#c00000", secondary: "#ffffff" },
  hus: { pattern: "two-tone-sleeves", primary: "#e63900", secondary: "#111111" },
  moas: { pattern: "stripes-vertical", primary: "#1e88e5", secondary: "#ffffff" },
};

/** Derive a slightly darker or lighter tone from a hex. */
function shade(hex: string, amount: number): string {
  const rgb = parseHex(hex);
  if (!rgb) return "#000000";
  const channels = rgb.map((c) => Math.max(0, Math.min(255, Math.round(c * 255) + amount)));
  return `#${channels.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

const INK_LIGHT = "#ffffff";
const INK_DARK = "#111111";

/**
 * The legible text colour on a kit colour, by WCAG 2 contrast: white or the
 * near-black the kit table uses, whichever measures higher.
 *
 * Replaces `readableInk`, which asked YIQ ≥ 150. YIQ is a perceived-brightness
 * heuristic, not a contrast ratio, and it disagrees with WCAG exactly where it
 * matters — saturated reds and oranges sit under 150 and got white at
 * 3.15-4.24:1 (Berkane's #f26522, Hassania's #e63900).
 * A value that is not a hex (production clubs fall back to `var(--ui-ink)`, a
 * dark navy fill) gets white, which is what the ink fill carries.
 */
export function inkOn(primary: string): string {
  const fill = parseHex(primary);
  if (!fill) return INK_LIGHT;
  const light = contrastRatio(fill, parseHex(INK_LIGHT)!);
  const dark = contrastRatio(fill, parseHex(INK_DARK)!);
  return light >= dark ? INK_LIGHT : INK_DARK;
}

/**
 * What the app calls a club of the current season, written once here so every
 * screen agrees: one short name, one code.
 *
 * The data does not give that. Its `short_name` is the full name for most
 * clubs, a code for Wydad ("WCA"), and "RCA Zemamra" for Zemamra, while its
 * `code` is blank for eleven of the sixteen. Letters derived from those names
 * gave Raja and Zemamra the same "RCA", and in Arabic gave CODM and Maghreb
 * Fès the same "الم". The names here identify the clubs; they claim no
 * official status (PRODUCT.md, Independence).
 */
export interface ClubIdentity {
  /**
   * Three or four Latin capitals, unique in the league: the letters on a crest
   * disc and in any cell too small for a name. The same in French and Arabic,
   * where codes stay left to right (PRODUCT.md, Numbers).
   */
  code: string;
  /** The name rows, cards, match headers and Pronostics print. The full name stays for headings. */
  short: LocalizedString;
}

interface BotolaClub {
  /** Lower-case fragments of the club's name, short name, slug words or code. */
  match: readonly string[];
  kit: KitColours;
  /** The sixteen clubs of the 2026/27 Botola Pro only. */
  identity?: ClubIdentity;
}

/**
 * Botola Pro club colours keyed by a lowercase fragment of the club name.
 * Used when the football catalog carries no colour for a club so every
 * squad renders in recognisable kits instead of one generic shirt.
 *
 * ORDER MATTERS: the first fragment found in the name wins, entry by entry
 * and then within an entry. Tétouan sits above Maghreb de Fès because the
 * mock "Maghreb Tétouan" contains both, and the old order painted it in
 * Maghreb de Fès's yellow. Anything specific goes above anything it contains.
 *
 * Each of the sixteen 2026/27 clubs also carries its `identity`: the one
 * short name and the one code the app shows for it (see `ClubIdentity`).
 */
const BOTOLA_CLUBS: readonly BotolaClub[] = [
  {
    match: ["wydad", "wca"],
    kit: { pattern: "solid", primary: "#c8102e", secondary: "#ffffff" },
    identity: { code: "WAC", short: { fr: "Wydad", ar: "الوداد" } },
  },
  {
    match: ["raja"],
    kit: { pattern: "solid", primary: "#0a8f3a", secondary: "#ffffff" },
    identity: { code: "RCA", short: { fr: "Raja", ar: "الرجاء" } },
  },
  {
    match: ["far rabat"],
    kit: { pattern: "central-stripe", primary: "#111111", secondary: "#c8102e" },
    identity: { code: "FAR", short: { fr: "FAR Rabat", ar: "الجيش الملكي" } },
  },
  {
    match: ["fus"],
    kit: { pattern: "stripes-vertical", primary: "#f28e00", secondary: "#111111" },
    identity: { code: "FUS", short: { fr: "FUS Rabat", ar: "الفتح الرباطي" } },
  },
  {
    match: ["berkane"],
    kit: { pattern: "two-tone-sleeves", primary: "#f26522", secondary: "#111111" },
    identity: { code: "RSB", short: { fr: "RS Berkane", ar: "نهضة بركان" } },
  },
  {
    // The production slug spells Tétouan's club "moghreb" ("moghreb-t-touan-…"),
    // and its accent becomes a hyphen, so neither "tétouan" nor "tetouan" reaches it.
    match: ["tétouan", "tetouan", "moghreb"],
    kit: { pattern: "bands-horizontal", primary: "#c00000", secondary: "#ffffff" },
    identity: { code: "MAT", short: { fr: "Moghreb Tétouan", ar: "المغرب التطواني" } },
  },
  {
    match: ["maghreb"],
    kit: { pattern: "stripes-vertical", primary: "#ffd400", secondary: "#111111" },
    identity: { code: "MAS", short: { fr: "Maghreb Fès", ar: "المغرب الفاسي" } },
  },
  {
    match: ["hassania"],
    kit: { pattern: "stripes-vertical", primary: "#e63900", secondary: "#ffffff" },
    identity: { code: "HUSA", short: { fr: "Hassania Agadir", ar: "حسنية أكادير" } },
  },
  {
    match: ["tanger"],
    kit: { pattern: "solid", primary: "#1e5bb8", secondary: "#ffffff" },
    identity: { code: "IRT", short: { fr: "Ittihad Tanger", ar: "اتحاد طنجة" } },
  },
  {
    match: ["difa"],
    kit: { pattern: "central-stripe", primary: "#0a7a3c", secondary: "#c8102e" },
    identity: { code: "DHJ", short: { fr: "Difaâ El Jadida", ar: "الدفاع الجديدي" } },
  },
  {
    match: ["kawkab"],
    kit: { pattern: "bands-horizontal", primary: "#c8102e", secondary: "#ffffff" },
    identity: { code: "KACM", short: { fr: "Kawkab Marrakech", ar: "الكوكب المراكشي" } },
  },
  {
    match: ["codm"],
    kit: { pattern: "stripes-vertical", primary: "#0a7a3c", secondary: "#ffffff" },
    identity: { code: "CODM", short: { fr: "CODM Meknès", ar: "النادي المكناسي" } },
  },
  {
    match: ["uts"],
    kit: { pattern: "solid", primary: "#1e3a7a", secondary: "#ffd400" },
    identity: { code: "UTS", short: { fr: "UTS Rabat", ar: "اتحاد تواركة" } },
  },
  {
    // "Renaissance Club Athletic Zemamra", "RCA Zemamra" in the data: its
    // initials are Raja's, so its code is the one the club writes, RCAZ.
    match: ["zemamra"],
    kit: { pattern: "solid", primary: "#ffffff", secondary: "#0a7a3c" },
    identity: { code: "RCAZ", short: { fr: "Zemamra", ar: "نهضة الزمامرة" } },
  },
  {
    match: ["tiznit"],
    kit: { pattern: "two-tone-sleeves", primary: "#1e5bb8", secondary: "#ffffff" },
    identity: { code: "AMT", short: { fr: "Amal Tiznit", ar: "أمل تيزنيت" } },
  },
  {
    // Témara's slug is "widad-t-mara-…": the accent became a hyphen here too.
    match: ["témara", "temara", "widad"],
    kit: { pattern: "central-stripe", primary: "#c8102e", secondary: "#1e3a7a" },
    identity: { code: "WAT", short: { fr: "Widad Témara", ar: "وداد تمارة" } },
  },
  // Former Botola Pro clubs: still in the history and in Pépites 2025/26, with
  // the names and letters the data gives them.
  { match: ["safi"], kit: { pattern: "solid", primary: "#7a1f1f", secondary: "#ffffff" } },
  { match: ["dche"], kit: { pattern: "solid", primary: "#f2a900", secondary: "#111111" } },
  { match: ["mansour"], kit: { pattern: "solid", primary: "#00703c", secondary: "#ffffff" } },
];

/**
 * What `findClubKit` reads from a club. `Club` satisfies it; so does a bare
 * `{ id, slug, name }` from a DTO, where `name` may be a plain string.
 */
export interface KitLookup {
  id?: string | null;
  slug?: string | null;
  name?: string | LocalizedString | null;
  shortName?: string | LocalizedString | null;
  crestPlaceholder?: string | null;
}

const text = (value: string | LocalizedString | null | undefined) =>
  typeof value === "string" ? value : value ? `${value.fr} ${value.ar}` : "";

/**
 * A club slug read as words, without the id it ends with:
 * "far-rabat-fd6ff8ea898c" → "far rabat". The slug is Latin in every
 * language, and it is the only Latin the club carries in Arabic: the football
 * API returns the name in the language asked for, so "الجيش الملكي" reaches
 * this lookup with no fragment to match, and every club painted as the ink.
 */
const slugWords = (slug: string | null | undefined) =>
  (slug ?? "")
    .toLowerCase()
    .replace(/-[0-9a-f]{6,}$/, "")
    .replace(/-/g, " ");

/**
 * The kit-table entry for a club: its id, then its slug, against the keyed
 * table; then a fragment of its name, short name, slug words or crest
 * letters, in table order. `key` is the id or fragment that matched.
 */
export function findClubKit(club: KitLookup): { key: string; kit: KitColours } | undefined {
  for (const candidate of [club.id, club.slug]) {
    const key = (candidate ?? "").trim().toLowerCase();
    if (key && OVERRIDES[key]) return { key, kit: OVERRIDES[key] };
  }
  const hit = findBotolaClub(club);
  return hit ? { key: hit.fragment, kit: hit.club.kit } : undefined;
}

/** The fragment table's entry for a club, and the fragment that matched. */
function findBotolaClub(club: KitLookup): { fragment: string; club: BotolaClub } | undefined {
  const haystack =
    `${text(club.name)} ${text(club.shortName)} ${slugWords(club.slug)} ${club.crestPlaceholder ?? ""}`.toLowerCase();
  for (const entry of BOTOLA_CLUBS) {
    const fragment = entry.match.find((candidate) => haystack.includes(candidate));
    if (fragment) return { fragment, club: entry };
  }
  return undefined;
}

/**
 * The short name and code the app shows for a club of the current season,
 * found the way its colours are (name, short name, slug words, code: Latin in
 * an Arabic response too, through the slug). `undefined` for any other club,
 * which keeps what the data says.
 */
export function findClubIdentity(club: KitLookup): ClubIdentity | undefined {
  return findBotolaClub(club)?.club.identity;
}

/** Every identity in the table, for tests that hold the codes and names unique. */
export function clubIdentityEntries(): ReadonlyArray<{ match: string; identity: ClubIdentity }> {
  return BOTOLA_CLUBS.flatMap((entry) =>
    entry.identity ? [{ match: entry.match[0]!, identity: entry.identity }] : [],
  );
}

/** Every entry of both tables, keyed tables first — for tests that sweep the whole palette. */
export function kitTableEntries(): ReadonlyArray<{ key: string; kit: KitColours }> {
  return [
    ...Object.entries(OVERRIDES).map(([key, kit]) => ({ key, kit })),
    ...BOTOLA_CLUBS.flatMap((entry) => entry.match.map((key) => ({ key, kit: entry.kit }))),
  ];
}

export function getKitForClub(club: Club | undefined, patternOverride?: KitPattern): KitConfig {
  if (!club) {
    return { pattern: "solid", primary: "#1a3a7a", secondary: "#ffffff", ink: inkOn("#1a3a7a") };
  }
  const base = findClubKit(club)?.kit;
  const primary = base?.primary ?? club.primaryColor;
  const secondary =
    base?.secondary ?? club.secondaryColor ?? shade(primary, primary.length ? -60 : 0);
  const pattern = patternOverride ?? base?.pattern ?? "solid";
  return { pattern, primary, secondary, ink: inkOn(primary) };
}
