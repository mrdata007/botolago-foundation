import type { PepitesPlayerCard, PepitesTeam } from "@/backend/pepites/contracts";
import { getKitForClub, type KitConfig } from "@/lib/kits";

import { teamAsClub } from "./pepites-format";

/**
 * The Pépites register from the Figma file "BotolaGO — Pépites (UI)": class
 * strings over the `--pepites-*` tokens in styles.css, and the pure helpers
 * the visual parts share. Tracking is `ltr:` only: Arabic is never
 * letter-spaced (BG-0069).
 */
export const pp = {
  page: "bg-[color:var(--pepites-page)]",
  night: "bg-[color:var(--pepites-night)] text-[color:var(--pepites-on-night)]",
  card: "bg-[color:var(--pepites-card)] shadow-[var(--pepites-card-shadow)]",
  row: "bg-[color:var(--pepites-card)] shadow-[var(--pepites-row-shadow)]",
  table: "bg-[color:var(--pepites-card)] shadow-[var(--pepites-table-shadow)]",
  /** Changa ExtraBold: figures, names, titles. */
  display: "font-[family-name:var(--ui-font-display)] [font-weight:800] leading-none",
  /** Manrope ExtraBold / Bold. */
  heavy: "[font-weight:800]",
  bold: "[font-weight:700]",
  /** IBM Plex Mono capitals: the meta lines. Arabic falls back to the body face. */
  mono: "font-[family-name:var(--pepites-font-mono)] [font-weight:500] ltr:uppercase",
  monoStrong: "font-[family-name:var(--pepites-font-mono)] [font-weight:600] ltr:uppercase",
  /**
   * The Figma slant (skewX −7.97°, scaleY .99, from the top-left corner). A
   * transform, so the box keeps its place in the flow. The Arabic frames set
   * names upright, so the slant is Latin-only.
   */
  lean: "inline-block origin-top-left [transform:skewX(-7.97deg)_scaleY(0.99)] rtl:[transform:none]",
  energyText:
    "bg-[image:var(--pepites-energy-text)] bg-clip-text text-transparent [-webkit-background-clip:text]",
  energyFill: "bg-[image:var(--pepites-energy)]",
  ink: "text-[color:var(--pepites-ink)]",
  text: "text-[color:var(--pepites-text)]",
  muted: "text-[color:var(--pepites-muted)]",
  onNightMeta: "text-[color:var(--pepites-on-night-meta)]",
  onNightSub: "text-[color:var(--pepites-on-night-sub)]",
  spring: "text-[color:var(--pepites-spring)]",
  divider: "border-[color:var(--pepites-divider)]",
  line: "border-[color:var(--pepites-line)]",
} as const;

/** "AM" from "Abdelhamid Maali"; a note in brackets ("(fictif)") does not count. */
export function initials(name: string): string {
  const words = name
    .replace(/\([^)]*\)/g, " ")
    .split(/\s+/)
    .map((word) => word.replace(/[^\p{L}]/gu, ""))
    .filter(Boolean);
  if (words.length === 0) return "?";
  const first = words[0]!.charAt(0);
  const last = words.length > 1 ? words[words.length - 1]!.charAt(0) : "";
  return `${first}${last}`.toLocaleUpperCase("fr");
}

/** The name printed on the back of the shirt: the last word, in capitals. */
export function shirtName(name: string): string {
  const words = name
    .replace(/\([^)]*\)/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const last = words.length > 1 ? words.slice(1).join(" ") : (words[0] ?? "");
  return last.replace(/\.$/, "").toLocaleUpperCase("fr");
}

/**
 * The club's kit (src/lib/kits.ts): the edge of a row, the disc, the shirt.
 * A club the kit table does not know, and whose catalog row carries no
 * colour, wears the default navy kit rather than no colour at all.
 */
export function teamKit(team: PepitesTeam | null | undefined): KitConfig {
  const kit = getKitForClub(teamAsClub(team));
  return /^#[0-9a-f]{6}$/i.test(kit.primary) ? kit : getKitForClub(undefined);
}

/** Seg10Bar: ten segments, `round(value / 10)` of them lit. */
export function segments(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(10, Math.round(value / 10)));
}

/** The lit segments' colours, spring to violet, in reading order. */
export const SEGMENT_COLOURS = [
  "#5de39b",
  "#65e0ae",
  "#6cddc1",
  "#74dad4",
  "#7bd7e7",
  "#7fcaf0",
  "#7eb3f0",
  "#7d9bf0",
  "#7d84f0",
  "#7c6cf0",
] as const;

export type RatingBand = 1 | 2 | 3 | 4 | 5;

/** RatingChip's fixed scale: <6, 6–6.5, 6.5–7, 7–7.5, ≥7.5. */
export function ratingBand(rating: number): RatingBand {
  if (rating < 6) return 1;
  if (rating < 6.5) return 2;
  if (rating < 7) return 3;
  if (rating < 7.5) return 4;
  return 5;
}

/** A card's club, position and age in the order the meta lines print them. */
export type MetaPlayer = Pick<PepitesPlayerCard, "team" | "positionGroup" | "age">;
