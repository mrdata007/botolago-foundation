import type {
  CardClubDto,
  HistoryRowDto,
  MemberCardDto,
  MyCardDto,
} from "@/backend/manager-card/contracts";
import { clubPalette } from "@/lib/club-palette";
import { isManagerCardSampleData } from "@/services/manager-card-mode";
import type { Club } from "@/types/domain";

import type { CardClub, CardProfile, StatCode, TierCode } from "./types";

/**
 * DTO to the profile a renderer draws (plan section 7.3). The browser never computes a rating: it
 * passes the server's numbers through, unchanged, and a missing one stays `null` (a dash on the
 * card, never 0).
 *
 * `sample` marks a development fixture so the object prints « Exemple »; it is read from the data
 * mode, which is statically `false` in a production build, and can be forced either way with
 * `options.sample`.
 */
export interface ProfileOptions {
  sample?: boolean;
}

const EMPTY_STATS: Record<StatCode, number | null> = {
  cap: null,
  sel: null,
  trf: null,
  con: null,
};

function sampleFlag(options?: ProfileOptions): { sample?: true } {
  return (options?.sample ?? isManagerCardSampleData()) ? { sample: true } : {};
}

const CONNECTORS = new Set(["de", "du", "des", "la", "le", "el", "al", "d", "l", "ou"]);

/** Two or three letters for a disc: the club code, else the short name's first letters. */
export function clubInitials(
  code: string | null | undefined,
  shortName: string,
  name: string,
): string {
  const fromCode = (code ?? "")
    .normalize("NFD")
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase();
  if (fromCode.length >= 2) return fromCode.slice(0, 3);
  for (const source of [shortName, name]) {
    const words = source
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .split(/[\s'’\-.]+/)
      .map((word) => word.replace(/[^A-Za-z0-9]/g, ""))
      .filter((word) => word && !CONNECTORS.has(word.toLowerCase()));
    if (words.length === 0) continue;
    const letters =
      words.length === 1
        ? words[0]!.slice(0, 2)
        : words
            .slice(0, words.length >= 3 ? 3 : 2)
            .map((word) => word[0]!)
            .join("");
    return letters.toUpperCase();
  }
  return "CL";
}

/**
 * The card's club: its colours through the club palette (the one place a club colour becomes a
 * paint). A club the palette has no colour for gives `null`: the card is drawn in its own
 * material, with no club part.
 */
export function toCardClub(dto: CardClubDto | null | undefined): CardClub | null {
  if (!dto) return null;
  const palette = clubPalette({
    id: dto.id,
    slug: dto.slug,
    name: dto.name,
    shortName: dto.shortName,
    primaryColor: dto.primaryColor,
    secondaryColor: dto.secondaryColor,
  });
  if (!palette.base) return null;
  return {
    id: dto.id,
    initials: clubInitials(dto.code, dto.shortName.fr, dto.name.fr),
    name: { fr: dto.name.fr, ar: dto.name.ar },
    primary: palette.base,
    secondary: palette.secondary,
  };
}

/** The same, from the app's own club record (the favourite club of a signed-in account, the try-on). */
export function cardClubFromClub(club: Club | null | undefined): CardClub | null {
  if (!club) return null;
  const palette = clubPalette(club);
  if (!palette.base) return null;
  return {
    id: club.id,
    initials: clubInitials(club.crestPlaceholder, club.shortName.fr, club.name.fr),
    name: { fr: club.name.fr, ar: club.name.ar },
    primary: palette.base,
    secondary: palette.secondary,
  };
}

/**
 * The manager's own card. A new season whose first rating has not come (`forming` with a
 * previous season, plan D7) shows last season's number and tier with that season's label, and no
 * marks, until this season has a number of its own.
 */
export function fromMyCard(card: MyCardDto, options?: ProfileOptions): CardProfile {
  const base: CardProfile = {
    name: card.name,
    ovr: card.ovr,
    tier: card.tier,
    provisional: card.provisional,
    counted: card.gameweeksCounted,
    minRated: card.minRated,
    season: card.season.label,
    serial: card.serial,
    founder: card.founder?.cohort ?? null,
    club: toCardClub(card.club),
    stats: {
      cap: card.stats.cap.value,
      sel: card.stats.sel.value,
      trf: card.stats.trf.value,
      con: card.stats.con.value,
    },
    ...sampleFlag(options),
  };
  if (card.ratingState === "forming" && card.previousSeason) {
    return {
      ...base,
      ovr: card.previousSeason.ovr,
      tier: card.previousSeason.tier,
      provisional: false,
      counted: null,
      season: card.previousSeason.label,
      stats: { ...EMPTY_STATS },
    };
  }
  return base;
}

/** Another manager's card, as a league member row or the face-à-face shows it. */
export function fromMember(card: MemberCardDto, options?: ProfileOptions): CardProfile {
  return {
    name: card.name,
    ovr: card.ovr,
    tier: card.tier,
    provisional: card.provisional,
    counted: card.gameweeksCounted,
    minRated: card.minRated,
    season: card.seasonLabel,
    serial: card.serial,
    founder: card.founderCohort,
    club: toCardClub(card.club),
    stats: { ...card.stats },
    ...sampleFlag(options),
  };
}

/**
 * A stored journée, for the replay: that journée's stats, number, tier and season, on the
 * manager's own name, club, serial and founder mark.
 */
export function fromHistoryRow(
  row: HistoryRowDto,
  card: MyCardDto,
  options?: ProfileOptions,
): CardProfile {
  return {
    name: card.name,
    ovr: row.ovr,
    tier: row.tier,
    provisional: row.provisional,
    counted: row.gameweeksCounted,
    minRated: card.minRated,
    season: row.seasonLabel,
    serial: card.serial,
    founder: card.founder?.cohort ?? null,
    club: toCardClub(card.club),
    stats: { ...row.stats },
    ...sampleFlag(options),
  };
}

/** The same card at another tier (the details page's ladder draws the profile at each tier). */
export function withTier(profile: CardProfile, tier: TierCode): CardProfile {
  return { ...profile, tier };
}

/**
 * The unnamed base card a guest sees: no name, no number, no marks, no founder part. `club` is
 * the try-on's choice, which is kept nowhere.
 */
export function guestProfile(
  options: { season?: string; club?: CardClub | null } = {},
): CardProfile {
  return {
    name: "",
    ovr: null,
    tier: null,
    provisional: false,
    counted: null,
    minRated: null,
    season: options.season ?? "",
    serial: null,
    founder: null,
    club: options.club ?? null,
    stats: { ...EMPTY_STATS },
  };
}

/**
 * A signed-in account with no team yet: its display name and favourite club on the base card.
 * `club` is the app's own club record (`findClub(user.favoriteClubId)`) or an already-made one.
 */
export function localProfile(options: {
  displayName: string;
  club: Club | CardClub | null;
  season?: string;
}): CardProfile {
  const club =
    options.club && "initials" in options.club ? options.club : cardClubFromClub(options.club);
  return {
    ...guestProfile({ season: options.season, club }),
    name: options.displayName.trim(),
  };
}
