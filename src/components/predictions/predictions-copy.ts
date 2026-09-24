import type { RoundState } from "@/backend/predictions/contracts";
import type { TranslationKey } from "@/i18n/dictionaries";
import { MATCH_TIME_ZONE } from "@/lib/match-kickoff";
import type { Language } from "@/types/domain";

/**
 * Pronostics' counted phrases and times. Arabic agrees the noun with the
 * number (one, two, 3–10, 11+), so each form is its own key, picked by
 * `Intl.PluralRules` and written as a literal call so the i18n gate sees every
 * one — the pattern of `standings-copy.ts`.
 */

type Translate = (key: TranslationKey) => string;

function plural(n: number, lang: Language): Intl.LDMLPluralRule {
  return new Intl.PluralRules(lang === "ar" ? "ar" : "fr").select(n);
}

/** Western digits in both languages (`ar-MA`), the house rule. */
export function formatNumber(n: number, lang: Language): string {
  return new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-FR").format(n);
}

/** "3 matchs à pronostiquer". */
export function remainingLabel(n: number, lang: Language, t: Translate): string {
  const rule = plural(n, lang);
  const template =
    rule === "one"
      ? t("predictions.remaining_one")
      : rule === "two"
        ? t("predictions.remaining_two")
        : rule === "few"
          ? t("predictions.remaining_few")
          : t("predictions.remaining_other");
  return template.replace("{n}", formatNumber(n, lang));
}

/** "Provisoire · 2 matchs à jouer". */
export function matchesLeftLabel(n: number, lang: Language, t: Translate): string {
  const rule = plural(n, lang);
  const template =
    rule === "one"
      ? t("predictions.board.matches_left_one")
      : rule === "two"
        ? t("predictions.board.matches_left_two")
        : rule === "few"
          ? t("predictions.board.matches_left_few")
          : t("predictions.board.matches_left_other");
  return template.replace("{n}", formatNumber(n, lang));
}

/** "5 journées". */
export function roundsPlayedLabel(n: number, lang: Language, t: Translate): string {
  const rule = plural(n, lang);
  const template =
    rule === "one"
      ? t("predictions.board.rounds_played_one")
      : rule === "two"
        ? t("predictions.board.rounds_played_two")
        : rule === "few"
          ? t("predictions.board.rounds_played_few")
          : t("predictions.board.rounds_played_other");
  return template.replace("{n}", formatNumber(n, lang));
}

/** The guest-import summary lines. */
export function claimImportedLabel(n: number, lang: Language, t: Translate): string {
  const rule = plural(n, lang);
  const template =
    rule === "one"
      ? t("predictions.claim.imported_one")
      : rule === "two"
        ? t("predictions.claim.imported_two")
        : rule === "few"
          ? t("predictions.claim.imported_few")
          : t("predictions.claim.imported_other");
  return template.replace("{n}", formatNumber(n, lang));
}

export function claimKeptLabel(n: number, lang: Language, t: Translate): string {
  const rule = plural(n, lang);
  const template =
    rule === "one"
      ? t("predictions.claim.kept_one")
      : rule === "two"
        ? t("predictions.claim.kept_two")
        : rule === "few"
          ? t("predictions.claim.kept_few")
          : t("predictions.claim.kept_other");
  return template.replace("{n}", formatNumber(n, lang));
}

export function claimStartedLabel(n: number, lang: Language, t: Translate): string {
  const rule = plural(n, lang);
  const template =
    rule === "one"
      ? t("predictions.claim.started_one")
      : rule === "two"
        ? t("predictions.claim.started_two")
        : rule === "few"
          ? t("predictions.claim.started_few")
          : t("predictions.claim.started_other");
  return template.replace("{n}", formatNumber(n, lang));
}

export function roundStateLabel(state: RoundState, t: Translate): string {
  switch (state) {
    case "upcoming":
      return t("predictions.round.state_upcoming");
    case "in_progress":
      return t("predictions.round.state_in_progress");
    case "provisional":
      return t("predictions.round.state_provisional");
    case "completed":
      return t("predictions.round.state_completed");
  }
}

function locale(lang: Language): string {
  return lang === "ar" ? "ar-MA" : "fr-FR";
}

/** "20:00", Casablanca time. */
export function formatKickoffTime(iso: string, lang: Language): string {
  return new Intl.DateTimeFormat(locale(lang), {
    timeZone: MATCH_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

/** "ven. 20:00": the next lock, within a week. */
export function formatLockMoment(iso: string, lang: Language): string {
  return new Intl.DateTimeFormat(locale(lang), {
    timeZone: MATCH_TIME_ZONE,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

/** "Vendredi 26 septembre": a day heading. */
export function formatDayHeading(iso: string, lang: Language): string {
  const text = new Intl.DateTimeFormat(locale(lang), {
    timeZone: MATCH_TIME_ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(iso));
  return text.charAt(0).toLocaleUpperCase() + text.slice(1);
}

/** The Casablanca calendar day of an instant, `YYYY-MM-DD`: groups a journée by day. */
export function matchDay(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: MATCH_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}
