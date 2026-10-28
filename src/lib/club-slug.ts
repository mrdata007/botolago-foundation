/**
 * Readable club addresses (SEO brief, 2026-10-27): `/clubs/rsb-berkane`
 * instead of `/clubs/7b2e23bc-…`.
 *
 * `app.clubs.slug` is not usable for this. On production it is the provider
 * slug with the first twelve hex digits of the id appended and accents
 * dropped rather than folded (`maghreb-f-s-0257feb34c16`, `olympique-dche-ra-…`),
 * and it can name a club it no longer is (`cr-khemis-zemamra-…` for RCA
 * Zemamra). So the address is derived here, with no migration, from the
 * club's French short name: the name people type into a search box
 * ("RSB Berkane", "Raja Casablanca"). A short name that is only a code
 * ("WCA") gives way to the full name, as in the tables (`rowClubName`), so
 * Wydad is `/clubs/wydad-casablanca`, not `/clubs/wca`.
 *
 * The slug is a pure function of that name, so it is stable across requests
 * and deploys and a link can be built from a club alone. It changes only if
 * the club's French short name does; the UUID address keeps answering, with a
 * 301 to the current slug.
 *
 * Two clubs can in principle share a short name. `buildClubSlugMap` gives
 * every one of them `-<first eight hex digits of its id>` so addresses stay
 * unique; `resolveClubRef` treats an ambiguous plain slug as unknown rather
 * than guess a club.
 */

import { rowClubName } from "@/lib/club-identity";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isClubUuid = (ref: string): boolean => UUID.test(ref);

/** Lower-case ASCII words joined by hyphens: accents folded, punctuation gone. */
export function slugifyClubName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

interface NamedClub {
  readonly id: string;
  readonly name: { readonly fr: string };
  readonly shortName: { readonly fr: string };
}

/**
 * The club's plain slug, or undefined when its French names have no Latin
 * letters (an Arabic-language response puts Arabic in `.fr`).
 */
export function clubSlug(club: Pick<NamedClub, "name" | "shortName">): string | undefined {
  const short = club.shortName.fr.trim();
  const name = short ? rowClubName(short, club.name.fr.trim()) : club.name.fr;
  return slugifyClubName(name) || slugifyClubName(club.name.fr) || undefined;
}

/** Club id → unique address segment, for every club of a French catalogue. */
export function buildClubSlugMap(clubs: readonly NamedClub[]): Map<string, string> {
  const plain = new Map<string, string | undefined>(clubs.map((club) => [club.id, clubSlug(club)]));
  const counts = new Map<string, number>();
  for (const slug of plain.values()) if (slug) counts.set(slug, (counts.get(slug) ?? 0) + 1);
  const result = new Map<string, string>();
  for (const [id, slug] of plain) {
    if (!slug) continue;
    result.set(id, (counts.get(slug) ?? 0) > 1 ? `${slug}-${id.slice(0, 8).toLowerCase()}` : slug);
  }
  return result;
}

/** The club a path segment names, whether it is a UUID or a slug. */
export function resolveClubRef<C extends NamedClub>(
  ref: string,
  clubs: readonly C[],
): C | undefined {
  if (isClubUuid(ref)) return clubs.find((club) => club.id.toLowerCase() === ref.toLowerCase());
  const wanted = ref.toLowerCase();
  const slugs = buildClubSlugMap(clubs);
  return clubs.find((club) => slugs.get(club.id) === wanted);
}

/** The path segment for a club's page: its slug when it has one, else its id. */
export const clubPathParam = (club: { readonly id: string; readonly pathSlug?: string }): string =>
  club.pathSlug ?? club.id;

/** The canonical path of a club's page, given the segment (slug or id). */
export const clubPath = (ref: string): string => `/clubs/${encodeURIComponent(ref)}`;
