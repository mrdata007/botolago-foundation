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
 */

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
