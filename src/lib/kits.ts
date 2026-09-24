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
 * Botola Pro club colours keyed by a lowercase fragment of the club name.
 * Used when the football catalog carries no colour for a club so every
 * squad renders in recognisable kits instead of one generic shirt.
 *
 * ORDER MATTERS: the first fragment found in the name wins. `tétouan` sits
 * above `maghreb` because the mock "Maghreb Tétouan" contains both, and the
 * old order painted it in Maghreb de Fès's yellow. Anything specific goes
 * above anything it contains.
 */
const BOTOLA_KITS: Array<[string, KitColours]> = [
  ["wydad", { pattern: "solid", primary: "#c8102e", secondary: "#ffffff" }],
  ["wca", { pattern: "solid", primary: "#c8102e", secondary: "#ffffff" }],
  ["raja", { pattern: "solid", primary: "#0a8f3a", secondary: "#ffffff" }],
  ["far rabat", { pattern: "central-stripe", primary: "#111111", secondary: "#c8102e" }],
  ["fus", { pattern: "stripes-vertical", primary: "#f28e00", secondary: "#111111" }],
  ["berkane", { pattern: "two-tone-sleeves", primary: "#f26522", secondary: "#111111" }],
  ["tétouan", { pattern: "bands-horizontal", primary: "#c00000", secondary: "#ffffff" }],
  ["tetouan", { pattern: "bands-horizontal", primary: "#c00000", secondary: "#ffffff" }],
  // The production slug spells Tétouan's club "moghreb" ("moghreb-t-touan-…"),
  // and its accent becomes a hyphen, so neither fragment above reaches it.
  ["moghreb", { pattern: "bands-horizontal", primary: "#c00000", secondary: "#ffffff" }],
  ["maghreb", { pattern: "stripes-vertical", primary: "#ffd400", secondary: "#111111" }],
  ["hassania", { pattern: "stripes-vertical", primary: "#e63900", secondary: "#ffffff" }],
  ["tanger", { pattern: "solid", primary: "#1e5bb8", secondary: "#ffffff" }],
  ["difa", { pattern: "central-stripe", primary: "#0a7a3c", secondary: "#c8102e" }],
  ["kawkab", { pattern: "bands-horizontal", primary: "#c8102e", secondary: "#ffffff" }],
  ["codm", { pattern: "stripes-vertical", primary: "#0a7a3c", secondary: "#ffffff" }],
  ["uts", { pattern: "solid", primary: "#1e3a7a", secondary: "#ffd400" }],
  ["zemamra", { pattern: "solid", primary: "#ffffff", secondary: "#0a7a3c" }],
  ["tiznit", { pattern: "two-tone-sleeves", primary: "#1e5bb8", secondary: "#ffffff" }],
  ["témara", { pattern: "central-stripe", primary: "#c8102e", secondary: "#1e3a7a" }],
  ["temara", { pattern: "central-stripe", primary: "#c8102e", secondary: "#1e3a7a" }],
  // Témara's slug is "widad-t-mara-…": the accent became a hyphen here too.
  ["widad", { pattern: "central-stripe", primary: "#c8102e", secondary: "#1e3a7a" }],
  ["safi", { pattern: "solid", primary: "#7a1f1f", secondary: "#ffffff" }],
  ["dche", { pattern: "solid", primary: "#f2a900", secondary: "#111111" }],
  ["mansour", { pattern: "solid", primary: "#00703c", secondary: "#ffffff" }],
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
  const haystack =
    `${text(club.name)} ${text(club.shortName)} ${slugWords(club.slug)} ${club.crestPlaceholder ?? ""}`.toLowerCase();
  const hit = BOTOLA_KITS.find(([fragment]) => haystack.includes(fragment));
  return hit ? { key: hit[0], kit: hit[1] } : undefined;
}

/** Every entry of both tables, keyed tables first — for tests that sweep the whole palette. */
export function kitTableEntries(): ReadonlyArray<{ key: string; kit: KitColours }> {
  return [
    ...Object.entries(OVERRIDES).map(([key, kit]) => ({ key, kit })),
    ...BOTOLA_KITS.map(([key, kit]) => ({ key, kit })),
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
