import type {
  EditionEntry,
  Movement,
  PepitesPlayerCard,
  PepitesTeam,
  PositionGroup,
} from "@/backend/pepites/contracts";
import type { TranslationKey } from "@/i18n/dictionaries";
import type { Language } from "@/types/domain";
import { resolveMediaUrl } from "@/lib/media";
import type { Club } from "@/types/domain";

/**
 * Small, pure helpers the Pépites screens share. Numbers use Latin digits in
 * both languages and never a space inside a number (plan §9: a space can flip
 * the digit order in an Arabic line).
 */

export function formatNumber(value: number, lang: Language, fractionDigits = 0): string {
  return new Intl.NumberFormat(lang === "ar" ? "ar-MA-u-nu-latn" : "fr-FR", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
    useGrouping: false,
  }).format(value);
}

/** A team as `PlayerPhoto` and `ClubCrest` want it: the palette keys on the slug. */
export function teamAsClub(team: PepitesTeam | null | undefined): Club | undefined {
  if (!team) return undefined;
  return {
    id: team.id,
    slug: team.slug ?? undefined,
    name: team.name,
    shortName: team.shortName,
    city: { fr: "", ar: "" },
    primaryColor: "",
    crestPlaceholder: team.shortName.fr.slice(0, 3).toUpperCase(),
  };
}

/** The approved photo's public URL, or null: the page then draws the silhouette. */
export function playerPhotoUrl(
  card: Pick<PepitesPlayerCard, "photo">,
  supabaseUrl?: string,
): string | null {
  if (!card.photo) return null;
  // The release's public path already starts with the `football/` namespace,
  // which the resolver maps to the `football-media` bucket.
  return resolveMediaUrl({ storagePath: card.photo.storagePath }, supabaseUrl) ?? null;
}

export const POSITION_GROUPS: readonly PositionGroup[] = ["GK", "DEF", "MID", "FWD"];

/** A position group's name, one literal key each (the i18n gate reads them). */
export function positionLabel(group: PositionGroup, t: (key: TranslationKey) => string): string {
  switch (group) {
    case "GK":
      return t("pepites.position.gk");
    case "DEF":
      return t("pepites.position.def");
    case "MID":
      return t("pepites.position.mid");
    case "FWD":
      return t("pepites.position.fwd");
  }
}

/** "↑ 2", "↓ 1", "=", "Nouveau": the arrow a reader saw last week (§4.5). */
export function movementText(
  movement: Movement,
  labels: { up: string; down: string; same: string; new: string },
): string | null {
  if (!movement) return null;
  switch (movement.kind) {
    case "new":
      return labels.new;
    case "same":
      return labels.same;
    case "up":
      return `${labels.up} ${movement.by ?? 1}`;
    case "down":
      return `${labels.down} ${movement.by ?? 1}`;
  }
}

/** "88" for a score, "N.C." when a player is not ranked (plan §3, "N.R." value). */
export function scoreText(
  score: number | null | undefined,
  lang: Language,
  unranked: string,
): string {
  return typeof score === "number" && Number.isFinite(score)
    ? formatNumber(Math.round(score), lang)
    : unranked;
}

/** The kickoff date as "12 oct." / "12 أكتوبر", in Morocco time. */
export function shortDate(iso: string, lang: Language): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-MA-u-nu-latn" : "fr-FR", {
    day: "numeric",
    month: "short",
    timeZone: "Africa/Casablanca",
  }).format(date);
}

/** The reveal time as "lundi 20:00" in Morocco time. */
export function revealTime(iso: string, lang: Language): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-MA-u-nu-latn" : "fr-FR", {
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Africa/Casablanca",
  }).format(date);
}

export interface TopTenItem {
  readonly rank: number;
  readonly score: number | null;
  readonly player: PepitesPlayerCard;
  readonly movement?: EditionEntry["movement"];
  readonly reasonFr?: string | null;
  readonly reasonAr?: string | null;
}

export function editionItems(entries: readonly EditionEntry[]): TopTenItem[] {
  return entries.map((entry) => ({
    rank: entry.rank,
    score: entry.score,
    player: entry.player,
    movement: entry.movement,
    reasonFr: entry.reasonFr,
    reasonAr: entry.reasonAr,
  }));
}
