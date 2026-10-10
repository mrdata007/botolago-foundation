/**
 * The card's club and the app's own club record are two views of one club. The card carries what
 * the server resolved (`CardClubDto`); the crest, the fixtures and the palette are the football
 * data's (`Club`). In production they share one id, so the match is by id; the slug and the name
 * only matter for development fixtures and for a club the football list has not got yet. The match
 * itself is `findCardClub` (`manager-card/catalogue-club.ts`), which the card's crest uses too.
 */
import type { CardClubDto } from "@/backend/manager-card/contracts";
import { findCardClub, squashName } from "@/components/manager-card/catalogue-club";
import type { Club } from "@/types/domain";

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
      code.length >= 2 ? code.slice(0, 4) : squashName(dto.shortName.fr).slice(0, 3).toUpperCase(),
  };
}

/** The app's club for the card's club, else a club drawn from the card; null for no club. */
export function resolveClub(
  clubs: readonly Club[] | null | undefined,
  dto: CardClubDto | null,
): Club | null {
  if (!dto) return null;
  return findCardClub(clubs, dto) ?? clubFromCard(dto);
}
