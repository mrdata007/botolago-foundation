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
 * The name a list row or a table line prints beside a club's crest: its
 * short name, unless that is only a code ("WCA" — Wydad's `short_name` on
 * production), which the crest disc already shows; then the full name. The
 * match card has made this call since BG-0111; tables make it here.
 */
export function rowClubName(shortName: string, name: string): string {
  return /^[A-Z0-9]{2,6}$/.test(shortName.trim()) ? name : shortName;
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
 * A longer, still readable code for a club whose short code collided with
 * another club's. "RCA Zemamra" is shown as "RCA" by `clubInitials` (two
 * words, so the first three letters), which is also Raja's real code. Keeping
 * the leading all-capitals word and adding the initial of the next one gives
 * "RCAZ", the abbreviation that club writes itself. Otherwise the initials of
 * every word, or the first four letters.
 */
function longerClubCode(shortName: string): string[] {
  const words = shortName.split(NON_LETTER).filter(Boolean);
  const candidates: string[] = [];
  const [first, second] = words;
  if (first && second && first.length >= 3 && first === first.toUpperCase()) {
    candidates.push(compact(first + second.slice(0, 1)).slice(0, 5));
  }
  const initials = words.map((word) => compact(word).slice(0, 1)).join("");
  if (initials.length >= 3) candidates.push(initials.slice(0, 4));
  candidates.push(compact(shortName).slice(0, 4));
  return candidates;
}

/**
 * The short code of every club in a list, with no two clubs sharing one.
 *
 * A club with its own `code` always keeps it. Where several clubs would show
 * the same letters, the ones without a code of their own get a longer
 * variant (see `longerClubCode`). If nothing distinct can be built, the
 * shared code stays: a repeated code is better than an invented one.
 */
export function uniqueClubShortCodes(
  teams: readonly {
    readonly id: string;
    readonly code?: string | null;
    readonly shortName?: string | null;
  }[],
): Map<string, string> {
  const codes = new Map<string, string>();
  const hasOwnCode = (team: (typeof teams)[number]) => (team.code ?? "").trim() !== "";
  for (const team of teams) codes.set(team.id, clubShortCode(team.code, team.shortName));

  const taken = new Set(codes.values());
  const members = new Map<string, typeof teams>();
  for (const team of teams) {
    const code = codes.get(team.id) ?? "";
    if (code) members.set(code, [...(members.get(code) ?? []), team]);
  }
  for (const [code, group] of members) {
    if (group.length < 2) continue;
    for (const team of group) {
      if (hasOwnCode(team)) continue;
      const replacement = longerClubCode(team.shortName ?? "").find(
        (candidate) => candidate.length >= 3 && candidate !== code && !taken.has(candidate),
      );
      if (replacement) {
        codes.set(team.id, replacement);
        taken.add(replacement);
      }
    }
  }
  return codes;
}
