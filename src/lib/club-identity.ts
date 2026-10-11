/**
 * BG-0111 — the short letters that stand in for a club when its crest is not
 * available (or is too small to read).
 *
 * `app.clubs.code` is the obvious source and it is not usable: on production
 * it is blank for 13 of the 21 active clubs, so anything keyed off it renders
 * an empty identity for most of the league. That is what put "(D)" and "(E)"
 * with no opponent on the pitch fixture plate.
 *
 * `short_name` is populated for all 21, so the fallback is derived from the
 * name instead. For 20 of the 21 it is the full club name ("Raja Club
 * Athletic"), whose word initials are the canonical code ("RCA"); for Wydad
 * Casablanca it is already the literal short code "WCA", which is returned
 * unchanged. Nothing here reads `code` — callers pass it in and it is used
 * only when it actually carries letters.
 *
 * The sixteen clubs of the current season no longer go through that
 * derivation: their short name and code are written in the club table
 * (`ClubIdentity` in `kits.ts`) and applied by `withClubIdentity`. The
 * derivation stays for any other club (former clubs in the history).
 */

import type { Club, LocalizedString } from "@/types/domain";

import { findClubIdentity } from "./kits";

const NON_LETTER = /[^\p{L}\p{N}]+/gu;

/** Letters/digits only, uppercased. */
function compact(value: string): string {
  return value.replace(NON_LETTER, "").toUpperCase();
}

/**
 * Particles a French or transliterated Arabic club name carries but no short
 * code ever does: "Renaissance Sportive **de** Berkane" is RSB, not RSD. Only
 * dropped when they are written lower-case, so an initialism that happens to
 * contain them ("AS FAR") is left alone.
 */
function isParticle(word: string): boolean {
  return word.length <= 3 && word === word.toLowerCase();
}

/**
 * Two-to-three letters derived from a club's short name.
 *
 * - already short ("WCA", "FUS") -> returned as-is
 * - three or more words ("Raja Club Athletic") -> word initials, "RCA"
 * - fewer ("Wydad Casablanca", "Berkane") -> the first three letters, "WYD"
 * - nothing usable -> "" (the caller decides what to do with that)
 *
 * Never returns a single letter: two letters say something, one says nothing.
 */
export function clubInitials(shortName: string | null | undefined): string {
  const raw = (shortName ?? "").trim();
  if (!raw) return "";

  const letters = compact(raw);
  if (!letters) return "";
  if (letters.length <= 4) return letters;

  const all = raw.split(NON_LETTER).filter(Boolean);
  const words = all.filter((word) => !isParticle(word));
  if (words.length >= 3) {
    const initials = words
      .slice(0, 3)
      .map((word) => compact(word).slice(0, 1))
      .join("");
    if (initials.length >= 2) return initials;
  }
  return letters.slice(0, 3);
}

/**
 * The name a list row or a table line prints beside a club's crest: its
 * short name, unless that is only a code ("WCA" — Wydad's `short_name` on
 * production), which the crest disc already shows; then the full name. The
 * match card has made this call since BG-0111; tables make it here.
 */
export function rowClubName(shortName: string, name: string): string {
  return /^[A-Z0-9]{2,6}$/.test(shortName.trim()) ? name : shortName;
}

/**
 * A club's one short name, the way every screen should print it: the name the
 * club table gives it (`withClubIdentity`, applied by the presenters), or,
 * for a club outside the table, its short name unless that is only a code.
 * "Zemamra" on the header, the stats and the pressure legend alike, and
 * "Wydad", never "WCA".
 */
export function clubShortName(
  club: { shortName: LocalizedString; name: LocalizedString },
  tr: (text: LocalizedString) => string,
): string {
  const short = tr(club.shortName).trim();
  return short ? rowClubName(short, tr(club.name)) : tr(club.name);
}

/**
 * A club as the presenters hand it to the screens, with the short name and
 * code from the club table (`findClubIdentity`, in `kits.ts`) when it is one
 * of the current season's clubs. Any other club is returned as it is.
 */
export function withClubIdentity<T extends Club>(club: T): T {
  const identity = findClubIdentity(club);
  if (!identity) return club;
  return { ...club, shortName: { ...identity.short }, crestPlaceholder: identity.code };
}

/**
 * The club's own short code when it has one, otherwise letters derived from
 * its short name. A blank or whitespace-only code counts as "has none" —
 * `??` does not catch `""`, which is exactly how an empty plate shipped.
 */
export function clubShortCode(
  code: string | null | undefined,
  shortName: string | null | undefined,
): string {
  const trimmed = (code ?? "").trim();
  if (trimmed) return trimmed.toUpperCase();
  return clubInitials(shortName);
}

/**
 * Words that say "this is a football club" and nothing about which one, in the
 * full names the league publishes ("Wydad **Athletic Club**", "Renaissance
 * **Sportive de** Berkane"): French, folded to lower-case without accents, and
 * Arabic as written.
 */
const GENERIC_FR = new Set([
  "club",
  "association",
  "sportive",
  "sportif",
  "football",
  "athletic",
  "athletique",
  "riadi",
  "sport",
  "sports",
  "de",
  "du",
  "des",
  "la",
  "le",
  "les",
  "et",
]);
const GENERIC_AR = new Set([
  "نادي",
  "الرياضي",
  "الرياضية",
  "رياضي",
  "رياضية",
  "لكرة",
  "كرة",
  "القدم",
  "جمعية",
  "الجمعية",
]);

/** The longest name, in letters, a narrow identity column carries whole. */
export const CLUB_NAME_FIT = { fr: 16, ar: 14 } as const;

function fold(word: string): string {
  return word.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * A club's recognisable short name for a place too narrow for its full one: the
 * generic words dropped, the distinctive ones kept in order. "Raja Club
 * Athletic" is "Raja"; "Renaissance Sportive de Berkane" is "Renaissance
 * Berkane"; "Maghreb Association Sportive de Fès" is "Maghreb Fès"; Arabic
 * "الوداد الرياضي" is "الوداد".
 *
 * Past two words it keeps the first and the last. A name that already fits (`fit` letters, `CLUB_NAME_FIT` by default) is
 * returned as it is, so "RS Berkane" and "AS FAR" are never touched, and so is
 * a name with nothing generic to drop: the layout wraps those between words.
 * It never returns an empty or one-letter name. The caller keeps the full name
 * for assistive tech and for any place with room.
 */
export function compactClubName(
  name: string,
  language: "fr" | "ar",
  fit: number = CLUB_NAME_FIT[language],
): string {
  const full = name.trim().replace(/\s+/g, " ");
  if (full.length <= fit) return full;
  const generic = language === "ar" ? GENERIC_AR : GENERIC_FR;
  // "d'El Jadida" and "l'Olympique" lose the elided article, not the name.
  const words = full
    .replace(/(^|\s)[dDlL][’']/g, "$1")
    .split(" ")
    .filter((word) => (language === "ar" ? !generic.has(word) : !generic.has(fold(word))));
  // Still three words and long: the first (the club's own name) and the last
  // (its city) say which club it is, and a short particle stays with the city
  // ("Difaâ Hassani El Jadida" is "Difaâ El Jadida").
  if (words.length > 2 && words.join(" ").length > fit) {
    const last = words[words.length - 1] ?? "";
    const before = words[words.length - 2] ?? "";
    words.splice(1, words.length - 1, ...(before.length <= 2 ? [before, last] : [last]));
  }
  const compact = words.join(" ");
  return compact.length >= 2 && compact.length < full.length ? compact : full;
}
