import type { TranslationKey } from "@/i18n/dictionaries";
import type { ClubGap, LeagueZone } from "@/lib/league-table";
import type { Language } from "@/types/domain";

/**
 * The table page's counted phrases. Arabic agrees the noun with the number —
 * one and two are words of their own ("جولة واحدة", "جولتين"), 3–10 take the
 * plural ("5 جولات") and 11+ the singular again ("30 جولة") — so each form is
 * its own key, picked by `Intl.PluralRules`, and written as a literal call so
 * the i18n gate sees every one (the pattern of `read-time.ts`).
 */

type Translate = (key: TranslationKey) => string;
type Format = (value: number) => string;

function plural(n: number, lang: Language): Intl.LDMLPluralRule {
  return new Intl.PluralRules(lang === "ar" ? "ar" : "fr").select(n);
}

/** "après 5 journées" / "بعد 5 جولات". */
export function roundsLabel(n: number, lang: Language, t: Translate, format: Format): string {
  const rule = plural(n, lang);
  const template =
    rule === "one"
      ? t("standings.after_rounds_one")
      : rule === "two"
        ? t("standings.after_rounds_two")
        : rule === "few"
          ? t("standings.after_rounds_few")
          : t("standings.after_rounds_other");
  return template.replace("{n}", format(n));
}

/** "56 pts" / "56 نقطة". */
export function pointsLabel(n: number, lang: Language, t: Translate, format: Format): string {
  const rule = plural(n, lang);
  const template =
    rule === "one"
      ? t("standings.points_one")
      : rule === "two"
        ? t("standings.points_two")
        : rule === "few"
          ? t("standings.points_few")
          : t("standings.points_other");
  return template.replace("{n}", format(n));
}

/** "1re place", "2e place" / "المركز 2". French ordinal "one" is the first place only. */
export function placeLabel(position: number, lang: Language, t: Translate, format: Format): string {
  const rule = new Intl.PluralRules(lang === "ar" ? "ar" : "fr", { type: "ordinal" }).select(
    position,
  );
  const template = rule === "one" ? t("standings.place_one") : t("standings.place_other");
  return template.replace("{n}", format(position));
}

/** "à 1 point de la 2e place", "2 points d'avance sur la 2e place", "à égalité de points avec…". */
export function gapLabel(gap: ClubGap, lang: Language, t: Translate, format: Format): string {
  if (gap.kind === "level") {
    return t("standings.gap_level").replace("{place}", placeLabel(gap.with, lang, t, format));
  }
  const rule = plural(gap.points, lang);
  const template =
    gap.kind === "lead"
      ? rule === "one"
        ? t("standings.gap_lead_one")
        : rule === "two"
          ? t("standings.gap_lead_two")
          : rule === "few"
            ? t("standings.gap_lead_few")
            : t("standings.gap_lead_other")
      : rule === "one"
        ? t("standings.gap_behind_one")
        : rule === "two"
          ? t("standings.gap_behind_two")
          : rule === "few"
            ? t("standings.gap_behind_few")
            : t("standings.gap_behind_other");
  const place = placeLabel(gap.kind === "lead" ? gap.over : gap.to, lang, t, format);
  return template.replace("{n}", format(gap.points)).replace("{place}", place);
}

export function zoneLabel(zone: LeagueZone, t: Translate): string {
  return zone === "champions_league"
    ? t("standings.zone.champions_league")
    : zone === "confederation_cup"
      ? t("standings.zone.confederation_cup")
      : t("standings.zone.relegation");
}
