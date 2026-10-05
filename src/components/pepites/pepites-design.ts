import type { PepitesPlayerCard, PepitesTeam } from "@/backend/pepites/contracts";
import { getKitForClub, type KitConfig } from "@/lib/kits";

import { teamAsClub } from "./pepites-format";

/**
 * The pure helpers the Pépites data glyphs share: initials, the name on the
 * shirt, the club's kit, the ten-segment rounding and the rating bands. No
 * styling lives here: since BG-0152 every Pépites screen takes its look from
 * the main kit (`src/components/ui-kit`).
 */

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
