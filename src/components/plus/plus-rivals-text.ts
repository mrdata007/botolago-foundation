import { pluralCategory } from "@/components/manager-card/copy";
import { fillText } from "@/components/manager-card/interpolate";
import type { TranslationKey } from "@/i18n/dictionaries";
import type { Rival } from "@/backend/premium/rivals";
import { totalGap } from "@/backend/premium/rivals";
import type { Language } from "@/types/domain";

type T = (key: TranslationKey) => string;

/**
 * Words for Rivaux that need more than a lookup: a counted noun in the right agreement (the keys are
 * literal, so the i18n gate sees every one), a day without its year, the sentence a friend gets in
 * WhatsApp. Nothing here computes a score.
 */

/** « 7 victoires » / « 7 انتصارات »: the form for `n`. */
export function winsText(t: T, lang: Language, n: number): string {
  switch (pluralCategory(n, lang)) {
    case "one":
      return fillText(t("plus.rv.wins_one"), { n });
    case "two":
      return fillText(t("plus.rv.wins_two"), { n });
    case "few":
      return fillText(t("plus.rv.wins_few"), { n });
    default:
      return fillText(t("plus.rv.wins_other"), { n });
  }
}

export function lossesText(t: T, lang: Language, n: number): string {
  switch (pluralCategory(n, lang)) {
    case "one":
      return fillText(t("plus.rv.losses_one"), { n });
    case "two":
      return fillText(t("plus.rv.losses_two"), { n });
    case "few":
      return fillText(t("plus.rv.losses_few"), { n });
    default:
      return fillText(t("plus.rv.losses_other"), { n });
  }
}

export function tiesText(t: T, lang: Language, n: number): string {
  switch (pluralCategory(n, lang)) {
    case "one":
      return fillText(t("plus.rv.ties_one"), { n });
    case "two":
      return fillText(t("plus.rv.ties_two"), { n });
    case "few":
      return fillText(t("plus.rv.ties_few"), { n });
    default:
      return fillText(t("plus.rv.ties_other"), { n });
  }
}

/** « Bilan : 7 victoires, 4 défaites » (ties only when there were some). */
export function bilanText(
  t: T,
  lang: Language,
  tally: { won: number; lost: number; tied: number },
): string {
  const parts = [winsText(t, lang, tally.won), lossesText(t, lang, tally.lost)];
  if (tally.tied > 0) parts.push(tiesText(t, lang, tally.tied));
  return fillText(t("plus.rv.bilan"), { parts: parts.join(lang === "ar" ? "، " : ", ") });
}

/**
 * « 12 oct. » / « 12 أكتوبر »: the day a journée was published, in Morocco's time zone (so the
 * stamp does not change with the reader's), Western digits and the Gregorian calendar in Arabic.
 */
export function formatDay(lang: Language, iso: string): string {
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-u-nu-latn-ca-gregory" : "fr-FR", {
    day: "numeric",
    month: "short",
    timeZone: "Africa/Casablanca",
  }).format(new Date(iso));
}

/** « Journée 11 · Publié le 12 oct. » (the day is left out when the journée has no stamp). */
export function stampText(t: T, lang: Language, rival: Rival): string | null {
  const last = rival.last;
  if (!last) return null;
  const round = fillText(t("fantasy.recap.gameweek"), { n: last.seq });
  if (!last.publishedAt) return round;
  const published = fillText(t("plus.rv.published"), { date: formatDay(lang, last.publishedAt) });
  return fillText(t("plus.rv.stamp"), { round, published });
}

/** « Vous menez de 14 pts » / « Sami mène de 15 pts » / « À égalité » (null when a total is unknown). */
export function gapLine(t: T, rival: Rival): string | null {
  const gap = totalGap(rival.last);
  if (gap === null) return null;
  if (gap === 0) return t("plus.rv.level");
  const size = fillText(t("plus.rv.pts"), { n: Math.abs(gap) });
  return gap > 0
    ? fillText(t("plus.rv.lead_me"), { gap: size })
    : fillText(t("plus.rv.lead_him"), { name: rival.name, gap: size });
}

/** The sentence that goes with the picture in WhatsApp. */
export function shareMessage(t: T, rival: Rival): string {
  const last = rival.last;
  if (!last || last.me === null || last.rival === null) return "";
  const gap = totalGap(last) ?? 0;
  const base = { n: last.seq, a: last.me, b: last.rival, name: rival.name };
  if (gap === 0) return fillText(t("plus.rv.share_msg_level"), base);
  const size = fillText(t("plus.rv.pts"), { n: Math.abs(gap) });
  return gap > 0
    ? fillText(t("plus.rv.share_msg_lead"), { ...base, gap: size })
    : fillText(t("plus.rv.share_msg_trail"), { ...base, gap: size });
}
