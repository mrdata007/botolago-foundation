/**
 * The club a Fantasy player (or fixture row) points at: by id first, then by
 * slug.
 *
 * Fantasy players carry `clubId`, and the football club list is produced by a
 * different repository. In cloud mode both key on the same club UUID, so the
 * id matches. The mock football repository mints synthetic UUIDs while the
 * Fantasy mocks key on the source slug ("war", "rca") — see `Club.slug` — so
 * an id-only `find` resolved nothing there, and every shirt on the pitch fell
 * back to one generic navy kit.
 *
 * One implementation, shared with the Fantasy lists: the squad screens import
 * it from here.
 */
export { findClub } from "@/components/fantasy/club-identity";
