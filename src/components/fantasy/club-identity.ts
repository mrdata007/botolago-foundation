import type { Club, LocalizedString } from "@/types/domain";

type Translate = (value: LocalizedString) => string;

/**
 * Club identity in the Fantasy screens.
 *
 * Production's team rows make this less obvious than it sounds:
 *
 * - `primary_color` / `secondary_color` are null for all 21 active clubs, so a
 *   colour-keyed treatment renders every club identically.
 * - `code` is null for 13 of the 21, and the two that would collide ("OLY" for
 *   Olympic Safi and Olympique Dcheïra) are both relegated sides with no
 *   players in the pool.
 * - `short_name` is the club's full name for every club except Wydad
 *   Casablanca, whose `short_name` is the string "WCA" — the same token its
 *   crest plate already shows.
 *
 * So: the crest is the reliable signal and is used wherever there is room for
 * it. These two helpers cover the places where there is not.
 */

/**
 * Whether a Fantasy row's club key names this club.
 *
 * BG-0111: Fantasy rows and the football club list come from two
 * repositories. In cloud mode both key clubs by the same UUID; in mock mode the
 * Fantasy rows key them by the source slug ("war", "rca") while the football
 * clubs carry a synthetic id and that slug. Joining on `id` alone matched
 * nothing in mock mode — every player row lost its club name and colours, and
 * the difficulty grid rendered no rows at all — so a key matches either.
 */
export function isClubKey(
  club: Pick<Club, "id" | "slug">,
  key: string | null | undefined,
): boolean {
  if (!key) return false;
  return club.id === key || (!!club.slug && club.slug === key);
}

/** The club a Fantasy row's club key names: by id first, then by slug. */
export function findClub<T extends Pick<Club, "id" | "slug">>(
  clubs: readonly T[] | null | undefined,
  key: string | null | undefined,
): T | undefined {
  if (!clubs || !key) return undefined;
  return clubs.find((club) => club.id === key) ?? clubs.find((club) => isClubKey(club, key));
}

/**
 * The name to print beside a crest.
 *
 * The short name, unless it is the very token the crest is already showing —
 * which would render "WCA WCA" beside neighbours reading "AMA Amal Tiznit".
 * A rule about not printing the same string twice, not a special case for one
 * club: it keeps the column readable whichever way the underlying `short_name`
 * data is eventually corrected.
 */
export function clubLabel(club: Club, tr: Translate): string {
  const short = tr(club.shortName).trim();
  return short === club.crestPlaceholder ? tr(club.name) : short;
}

/**
 * A compact token for a cell too small for a name — the FDR grid's opponent
 * square, a next-fixture plate.
 *
 * It starts from the same token the crest plate shows, so a cell and a crest
 * never disagree, and then repairs the one way that token comes out broken:
 * `presentFootballClub` falls back to `shortName.slice(0, 3)` when `code` is
 * null, which is 13 of the 21 clubs, and a short first word leaves a fragment
 * — "JS Soualem" becomes `"JS "`, trailing space and all. Anything shorter
 * than three usable characters is rebuilt from the name by whole words.
 *
 * Where a real `code` exists it is kept, because "MAS", "RCAZ" and "WCA" are
 * the abbreviations supporters actually use and a mechanical slice of the name
 * is not.
 *
 * A caller must still give the cell the club's full name (`title`, or text
 * only a screen reader sees). Three letters are a convenience for someone who
 * already knows the league, never the only way to identify a club — and with
 * `code` null for most of it, never a signal to rely on alone.
 */
export function clubToken(club: Club, tr: Translate): string {
  const placeholder = (club.crestPlaceholder ?? "").trim();
  if (placeholder.length >= 3) return placeholder;
  const words = tr(club.name).trim().split(/\s+/).filter(Boolean);
  let out = "";
  for (const word of words) {
    out += word;
    if (out.length >= 3) break;
  }
  return (out.slice(0, 3) || placeholder).toLocaleUpperCase();
}
