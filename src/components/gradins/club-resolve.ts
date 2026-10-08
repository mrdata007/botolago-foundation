/**
 * The card's club and the app's own club record are two views of one club. The card carries what
 * the server resolved (`CardClubDto`); the crest, the fixtures and the palette are the football
 * data's (`Club`). In production they share one id, so the match is by id; the slug and the name
 * only matter for development fixtures and for a club the football list has not got yet.
 */
import { findClub } from "@/components/fantasy/club-identity";
import type { CardClubDto } from "@/backend/manager-card/contracts";
import type { Club } from "@/types/domain";

function squash(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9؀-ۿ]+/g, "");
}

/** A `Club` drawn from the card's own club data, for when the football list has no such club. */
export function clubFromCard(dto: CardClubDto): Club {
  const code = (dto.code ?? "").trim().toUpperCase();
  return {
    id: dto.id,
    ...(dto.slug ? { slug: dto.slug } : {}),
    name: { fr: dto.name.fr, ar: dto.name.ar },
    shortName: { fr: dto.shortName.fr, ar: dto.shortName.ar },
    city: { fr: dto.city?.fr ?? "", ar: dto.city?.ar ?? "" },
    primaryColor: dto.primaryColor ?? "",
    ...(dto.secondaryColor ? { secondaryColor: dto.secondaryColor } : {}),
    crestPlaceholder:
      code.length >= 2 ? code.slice(0, 4) : squash(dto.shortName.fr).slice(0, 3).toUpperCase(),
  };
}

/** The app's club for the card's club, else a club drawn from the card; null for no club. */
export function resolveClub(
  clubs: readonly Club[] | null | undefined,
  dto: CardClubDto | null,
): Club | null {
  if (!dto) return null;
  const byKey = findClub(clubs, dto.id) ?? findClub(clubs, dto.slug);
  if (byKey) return byKey;
  const wanted = squash(dto.name.fr);
  const byName = wanted
    ? (clubs ?? []).find(
        (club) => squash(club.name.fr) === wanted || squash(club.name.ar) === squash(dto.name.ar),
      )
    : undefined;
  return byName ?? clubFromCard(dto);
}
