import type { Club } from "@/types/domain";

/**
 * The club a Fantasy player (or fixture row) points at: by id first, then by
 * slug.
 *
 * Fantasy players carry `clubId`, and the football club list is produced by a
 * different repository. In cloud mode both key on the same club UUID, so the
 * id matches. The mock football repository mints synthetic UUIDs while the
 * Fantasy mocks key on the source slug ("war", "rca") — see `Club.slug` — so
 * an id-only `find` resolved nothing there, and every shirt on the pitch fell
 * back to `getKitForClub(undefined)`: one generic navy kit for the whole
 * squad, no club name on the plates, no club edge on the rows.
 * `useNextFixtures` already joined on either key; this is the same join, once.
 */
export function findClub(clubs: readonly Club[], id: string | null | undefined): Club | undefined {
  if (!id) return undefined;
  return clubs.find((club) => club.id === id) ?? clubs.find((club) => club.slug === id);
}
