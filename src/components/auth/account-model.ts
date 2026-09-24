import type { ClubColourSource } from "@/lib/club-palette";

/**
 * The pure decisions behind the account screens — Profile, the profile-setup
 * wizard and the auth band. No React and no router, so each one is unit-tested
 * in `account-model.test.ts` rather than trusted to a screenshot.
 */

/** Any letter of the Arabic script, the supplements and presentation forms included. */
const ARABIC_SCRIPT = /\p{Script=Arabic}/u;

/** The first letter or digit of a word — never a bracket, an emoji or a combining mark. */
function firstLetter(word: string): string | undefined {
  return word.match(/[\p{L}\p{N}]/u)?.[0];
}

/**
 * The letters on the avatar disc when there is no photo: the first letter of
 * the first two words of the display name ("Rachid Demo" → "RD"), else the
 * first letter of the username ("rachid_demo" → "R").
 *
 * Arabic gets ONE letter. Two initials set side by side are not an Arabic
 * abbreviation: the letters join into a two-letter word that is not the name
 * ("محمد أمين" would print "مأ"). Returns "" when there is nothing to draw,
 * and the caller shows the person glyph instead.
 */
export function profileInitials(
  displayName: string | null | undefined,
  username?: string | null,
): string {
  const fromName = (displayName ?? "")
    .trim()
    .split(/\s+/)
    .map(firstLetter)
    .filter((letter): letter is string => !!letter);
  const letters =
    fromName.length > 0
      ? fromName
      : [firstLetter((username ?? "").trim())].filter((letter): letter is string => !!letter);
  if (letters.length === 0) return "";
  if (ARABIC_SCRIPT.test(letters[0])) return letters[0];
  return letters.slice(0, 2).join("").toLocaleUpperCase("fr");
}

/**
 * The tiles of Profile's "Mes clubs": the favourite first (it carries the
 * "Favori" badge), then every followed club in the order the follow service
 * returned it, the favourite never twice.
 *
 * Empty unless the reader follows at least one club OTHER than the
 * favourite. The favourite on its own is already on the identity card, as
 * the supporter chip; a section repeating it as a single tile says nothing
 * new. A favourite nobody follows still leads the row once there is a row.
 */
export function profileClubs<C extends { id: string }>(
  favorite: C | undefined,
  followed: readonly C[],
): Array<{ club: C; favorite: boolean }> {
  const others = followed.filter((club) => club.id !== favorite?.id);
  if (others.length === 0) return [];
  return [
    ...(favorite ? [{ club: favorite, favorite: true }] : []),
    ...others.map((club) => ({ club, favorite: false })),
  ];
}

/**
 * `?step=` on `/auth/profile-setup`. Profile's Notifications row opens the
 * wizard on its notifications step (3); 2 is the club picker. Anything else —
 * absent, 1, out of range, not a number — is the wizard's own start. The
 * router hands a number for `?step=3` and a string when the value was quoted,
 * so both are read.
 */
export function setupStepFromSearch(raw: unknown): 2 | 3 | undefined {
  const step = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  return step === 2 || step === 3 ? step : undefined;
}

/**
 * The eight clubs whose colours run as a strip across the auth photo band,
 * resolved through the club palette like any other club colour (never a hex).
 *
 * The board's strip is the keyed kit table; this is that table with ONE
 * swap. AS FAR's navy (`asfar`) is the same ink as the band's own scrim and
 * disappeared into it, so Maghreb de Fès's yellow — found by name, it has no
 * keyed entry — takes its place. `account-model.test.ts` holds every entry to
 * a real kit colour, so a renamed key cannot quietly turn a bar into the ink.
 */
export const AUTH_BAND_CLUBS: readonly ClubColourSource[] = [
  { slug: "war" },
  { slug: "moas" },
  { slug: "rca" },
  { slug: "rsb" },
  { slug: "fus" },
  { name: "Maghreb de Fès" },
  { slug: "mat" },
  { slug: "hus" },
];
