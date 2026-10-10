/**
 * The card's club and the app's own club record are two views of one club. The card carries what
 * the server resolved (`CardClubDto`, or the profile's `CardClub`); the crest, the fixtures and the
 * palette are the football data's (`Club`). In production they share one id, so the match is by
 * id; the slug and the name only matter for development fixtures and for a club the football list
 * has not got yet. Curva's « Votre club » (`curva/club-resolve.ts`) and the card's crest
 * (`use-card-crest.ts`) both find the club here.
 */
import { findClub } from "@/components/fantasy/club-identity";
import type { Club } from "@/types/domain";

/** A name reduced to its letters and digits, without accents, for comparing two spellings. */
export function squashName(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9؀-ۿ]+/g, "");
}

/** The app's club for a card's club, by id, then slug, then name; undefined when the list has none. */
export function findCardClub(
  clubs: readonly Club[] | null | undefined,
  card: {
    id: string;
    slug?: string | null;
    name: { fr: string; ar: string };
  },
): Club | undefined {
  const byKey = findClub(clubs, card.id) ?? findClub(clubs, card.slug);
  if (byKey) return byKey;
  const wanted = squashName(card.name.fr);
  return wanted
    ? (clubs ?? []).find(
        (club) =>
          squashName(club.name.fr) === wanted ||
          squashName(club.name.ar) === squashName(card.name.ar),
      )
    : undefined;
}
