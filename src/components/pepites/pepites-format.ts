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
import { moroccoDateTimeFormat } from "@/lib/morocco-time";

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

/** What the app's club catalogue knows about a club that a Pépites team does not carry. */
export type ListedClub = Pick<Club, "crestUrl" | "crestPlaceholder">;

/**
 * A team as `PlayerPhoto` and `ClubCrest` want it: the palette keys on the
 * slug. `listed` is the same club in the app's club catalogue (the same ids
 * as `app.teams`), which carries the crest and the short code the rest of
 * the app prints on a crest disc; without it the disc shows the first three
 * letters of the club's name.
 */
export function teamAsClub(
  team: PepitesTeam | null | undefined,
  listed?: ListedClub | null,
): Club | undefined {
  if (!team) return undefined;
  return {
    id: team.id,
    slug: team.slug ?? undefined,
    name: team.name,
    shortName: team.shortName,
    city: { fr: "", ar: "" },
    primaryColor: "",
    crestPlaceholder:
      listed?.crestPlaceholder?.trim() || team.shortName.fr.slice(0, 3).toUpperCase(),
    ...(listed?.crestUrl ? { crestUrl: listed.crestUrl } : {}),
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
 * The dot between the parts of a meta or figures line, with a no-break
 * space before it: a line that wraps breaks after a dot, so a dot never
 * starts a line ("Olympique Dcheïra · MIL ·" then "23A", not "· 23A").
 */
export const META_SEPARATOR = "\u00a0· ";

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
  return parts.join(META_SEPARATOR);
}

/**
 * A row's figures line, under its meta line: "2 087’ · 16B 1PD" (minutes,
 * then goals and assists), the figures isolated so an Arabic line keeps
 * their order. The same parts `playerMetaLine` appends to a short line.
 */
export function playerFiguresLine(
  stats: { minutes: number; goals: number; assists: number },
  { t, lang }: { t: (key: TranslationKey) => string; lang: Language },
): string {
  const iso = (text: string) => `\u2068${text}\u2069`;
  return [
    iso(`${formatCount(stats.minutes, lang)}’`),
    t("pepites.meta.goals_assists")
      .replace("{g}", iso(formatNumber(stats.goals, lang)))
      .replace("{a}", iso(formatNumber(stats.assists, lang))),
  ].join(META_SEPARATOR);
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
  return moroccoDateTimeFormat(lang === "ar" ? "ar-MA-u-nu-latn" : "fr-FR", {
    day: "numeric",
    month: "short",
  }).format(date);
}

/** The reveal time as "lundi 20:00" in Morocco time. */
export function revealTime(iso: string, lang: Language): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  return moroccoDateTimeFormat(lang === "ar" ? "ar-MA-u-nu-latn" : "fr-FR", {
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
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

/** Preserve the provider's short/full year format and separator. */
export function nextSeasonLabel(label: string): string {
  const match = /^(\d{4})([-/])(\d{2}|\d{4})$/.exec(label.trim());
  if (!match) return label;
  const start = Number(match[1]) + 1;
  const end =
    match[3].length === 4 ? String(start + 1) : String((start + 1) % 100).padStart(2, "0");
  return `${start}${match[2]}${end}`;
}
