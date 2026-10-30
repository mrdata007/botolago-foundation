/**
 * A journée's points are published all at once (migration 20261030100000): until
 * then the Fantasy screens say when. This is the pure part that picks which
 * journée the notice is about, from the season's gameweek list.
 */

export interface PublicationNotice {
  /** The journée's number. */
  gameweek: number;
  /** The moment its points are published, an ISO instant. */
  publishAt: string;
}

/** How often a visible notice looks again, so it leaves by itself once published. */
export const PUBLICATION_NOTICE_REFRESH_MS = 60_000;

interface GameweekPublicationItem {
  sequence: number;
  publicationHeld?: boolean;
  publishAt?: string | null;
}

const validInstant = (value: string | null | undefined): value is string =>
  typeof value === "string" && Number.isFinite(Date.parse(value));

/**
 * The notice to show. With a journée number: that journée's, if its points are
 * waiting for a known moment. Without one: the oldest journée still waiting,
 * which is the next one the fans will see published. Nothing when no journée is
 * waiting, when the moment is not known yet, and for a database that does not
 * say (the fields are absent).
 */
export function publicationNoticeOf(
  gameweeks: ReadonlyArray<GameweekPublicationItem> | null | undefined,
  sequence: number | null,
): PublicationNotice | null {
  const waiting = (gameweeks ?? [])
    .filter((item) => item.publicationHeld === true && validInstant(item.publishAt))
    .sort((a, b) => a.sequence - b.sequence);
  const item =
    sequence === null ? waiting[0] : waiting.find((entry) => entry.sequence === sequence);
  return item ? { gameweek: item.sequence, publishAt: item.publishAt as string } : null;
}
