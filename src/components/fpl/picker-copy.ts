import type { TranslationKey } from "@/i18n/dictionaries";
import type { Language } from "@/types/domain";

type Translate = (key: TranslationKey) => string;

/**
 * "1 transfert gratuit, ensuite −4 pts": what the next transfer costs. Arabic
 * has its own words for 1, for 2 and for 3 to 10; the one and two keys spell
 * their number out, so they are for exactly 1 and 2. With none left the line
 * says each transfer now costs points. Each form is a literal translation
 * call, so the i18n gate sees every key.
 */
export function transferCostLabel(
  free: number,
  hit: number,
  lang: Language,
  t: Translate,
  format: (value: number) => string,
): string {
  if (free <= 0) return t("fpl.pick.transfer_cost_none").replace("{hit}", format(hit));
  let rule: "one" | "two" | "few" | "other";
  if (lang === "fr") rule = free === 1 ? "one" : free === 2 ? "two" : "other";
  else {
    const selected = new Intl.PluralRules("ar").select(free);
    rule =
      selected === "one"
        ? free === 1
          ? "one"
          : "other"
        : selected === "two"
          ? free === 2
            ? "two"
            : "other"
          : selected === "few"
            ? "few"
            : "other";
  }
  const template =
    rule === "one"
      ? t("fpl.pick.transfer_cost_one")
      : rule === "two"
        ? t("fpl.pick.transfer_cost_two")
        : rule === "few"
          ? t("fpl.pick.transfer_cost_few")
          : t("fpl.pick.transfer_cost_other");
  return template.replace("{n}", format(free)).replace("{hit}", format(hit));
}

/** A position as a word ("défenseur"), not the three-letter tag the lists use. */
export function positionWord(position: "GK" | "DEF" | "MID" | "FWD", t: Translate): string {
  return position === "GK"
    ? t("player.pos_full.GK")
    : position === "DEF"
      ? t("player.pos_full.DEF")
      : position === "MID"
        ? t("player.pos_full.MID")
        : t("player.pos_full.FWD");
}
