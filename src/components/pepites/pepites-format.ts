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

/**
 * A count as the Figma sets it: "2 087" in French (a narrow no-break space
 * groups the thousands), no grouping in Arabic, where a space inside a
 * number can flip its digits in the line (plan §9).
 */
export function formatCount(value: number, lang: Language): string {
  if (lang === "ar") return formatNumber(value, lang);
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(value);
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

/** A position group's short name ("ATT", "MIL", "DEF", "GB"). */
export function positionShort(group: PositionGroup, t: (key: TranslationKey) => string): string {
  switch (group) {
    case "GK":
      return t("pepites.position_short.gk");
    case "DEF":
      return t("pepites.position_short.def");
    case "MID":
      return t("pepites.position_short.mid");
    case "FWD":
      return t("pepites.position_short.fwd");
  }
}

/**
 * The mono meta line under a name. Short (a row): "IRT · ATT · 20A · 1 275’ ·
 * 0B 8PD". Long (the hero): "HASSANIA AGADIR · ATT · 21 ANS". Figures are
 * isolated so an Arabic line keeps their order.
 */
export function playerMetaLine(
  player: Pick<PepitesPlayerCard, "team" | "positionGroup" | "age">,
  stats: { minutes: number; goals: number; assists: number } | null | undefined,
  {
    t,
    tr,
    lang,
    long = false,
  }: {
    t: (key: TranslationKey) => string;
    tr: (value: { fr: string; ar: string }) => string;
    lang: Language;
    long?: boolean;
  },
): string {
  const iso = (text: string) => `\u2068${text}\u2069`;
  const parts: string[] = [];
  if (player.team) parts.push(tr(long ? player.team.name : player.team.shortName));
  if (player.positionGroup) parts.push(positionShort(player.positionGroup, t));
  if (typeof player.age === "number") {
    parts.push(
      (long ? t("pepites.meta.age_long") : t("pepites.meta.age_short")).replace(
        "{n}",
        iso(formatNumber(player.age, lang)),
      ),
    );
  }
  if (stats && !long) {
    parts.push(iso(`${formatCount(stats.minutes, lang)}’`));
    parts.push(
      t("pepites.meta.goals_assists")
        .replace("{g}", iso(formatNumber(stats.goals, lang)))
        .replace("{a}", iso(formatNumber(stats.assists, lang))),
    );
  }
  return parts.join(" · ");
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

/** The score's five parts, in the order the percentiles and the wheel show them. */
export const COMPONENTS = ["rating", "form", "contribution", "progression", "minutes"] as const;
export type ComponentKey = (typeof COMPONENTS)[number];

export function componentLabel(key: ComponentKey, t: (key: TranslationKey) => string): string {
  switch (key) {
    case "rating":
      return t("pepites.component.rating");
    case "form":
      return t("pepites.component.form");
    case "contribution":
      return t("pepites.component.contribution");
    case "progression":
      return t("pepites.component.progression");
    case "minutes":
      return t("pepites.component.minutes");
  }
}

/** "2026-27" after "2025-26". A label it cannot read stays as it is. */
export function nextSeasonLabel(label: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(label.trim());
  if (!match) return label;
  const start = Number(match[1]) + 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}
