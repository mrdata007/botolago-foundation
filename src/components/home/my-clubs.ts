import { clubFixtures, clubResults, nextClubMatch } from "@/lib/club-season";
import type { Match } from "@/types/domain";

/** One club card on Home: the club, and whether it is the reader's favourite. */
export interface HomeClubTile<C> {
  club: C;
  favorite: boolean;
}

/**
 * The clubs of Home's "Mes clubs" row: the favourite first (it carries the
 * "Favori" badge), then every followed club in the order the follow service
 * returned it, the favourite never twice.
 *
 * Unlike Profile's tiles (`profileClubs`), a favourite on its own is a row:
 * Profile already shows it on the identity card, but Home has nothing else
 * that says when it plays next. Empty when the reader has neither a
 * favourite nor a followed club.
 */
export function homeClubs<C extends { id: string }>(
  favorite: C | undefined,
  followed: readonly C[],
): Array<HomeClubTile<C>> {
  const others = followed.filter((club) => club.id !== favorite?.id);
  return [
    ...(favorite ? [{ club: favorite, favorite: true }] : []),
    ...others.map((club) => ({ club, favorite: false })),
  ];
}

/**
 * What a club's card says about the club's matches:
 *
 * - `next`: the match being played, else the next on the calendar;
 * - `postponed`: nothing is scheduled but a fixture has lost its date, and
 *   the card says the date is still to be confirmed (the match card does);
 * - `result`: nothing is left to play this season, or nothing has a date,
 *   so the last result stands in;
 * - `none`: the club has not played yet this season and has no fixture.
 *
 * A dated match always beats a postponed one, as it does on the club page's
 * "Prochain match". A fixture that was cancelled or abandoned will not be
 * played as scheduled, so it never counts as a date still to come.
 */
export type ClubSpotlight =
  | { kind: "next" | "postponed" | "result"; match: Match }
  | { kind: "none" };

export function clubSpotlight(matches: readonly Match[], clubId: string): ClubSpotlight {
  const next = nextClubMatch(matches);
  if (next) return { kind: "next", match: next };
  const postponed = clubFixtures(matches).find((match) => match.status === "postponed");
  if (postponed) return { kind: "postponed", match: postponed };
  const last = clubResults(matches, clubId)[0];
  if (last) return { kind: "result", match: last };
  return { kind: "none" };
}
