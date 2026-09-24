/**
 * The non-component half of `ClubCrest`: the palette cache and the monogram
 * fit. Kept out of `ClubCrest.tsx` so that file exports only components
 * (React Fast Refresh), and so the rules can be unit-tested directly.
 */

import { clubStyle } from "@/lib/club-palette";
import type { Club } from "@/types/domain";

/**
 * `clubStyle()` walks the kit table and steps colours 1% at a time to find a
 * contrast; it is pure but not free (~0.05ms). A crest renders in every row
 * of every table, and the same twenty clubs come back each time, so the
 * answer is kept per club. Bounded: a runaway set of distinct clubs clears it.
 */
const STYLE_CACHE = new Map<string, ReturnType<typeof clubStyle>>();
const STYLE_CACHE_MAX = 256;

/** The identity the palette reads from a club — everything `clubPalette` looks at. */
export function crestStyleKey(club: Club): string {
  return [
    club.id,
    club.slug ?? "",
    club.name?.fr ?? "",
    club.shortName?.fr ?? "",
    club.crestPlaceholder ?? "",
    club.primaryColor ?? "",
    club.secondaryColor ?? "",
  ].join("|");
}

/** `clubStyle(club)`, memoised on `crestStyleKey`. The result is shared: never mutate it. */
export function crestStyle(club: Club): ReturnType<typeof clubStyle> {
  const key = crestStyleKey(club);
  const hit = STYLE_CACHE.get(key);
  if (hit) return hit;
  if (STYLE_CACHE.size >= STYLE_CACHE_MAX) STYLE_CACHE.clear();
  const style = clubStyle(club);
  STYLE_CACHE.set(key, style);
  return style;
}

/**
 * The monogram's cap, as a share of the disc's width (`cqi`). Three bold
 * letters fit in 40% ("WAC" once showed as "WA(" in a 20px badge); a
 * four-letter code ("HUSA", "CODM") needs 30% to stay inside the circle.
 * Two literal classes, because Tailwind only generates what it can read.
 */
export function crestMonogramClass(code: string | null | undefined): string {
  return (code ?? "").trim().length > 3
    ? "[font-size:min(1em,30cqi)]"
    : "[font-size:min(1em,40cqi)]";
}
