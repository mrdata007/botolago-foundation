import { useMemo } from "react";

import type { TranslationKey } from "@/i18n/dictionaries";
import { useI18n } from "@/i18n/provider";

import { usePlusCopy } from "./plus-copy";
import type { RatingCode } from "./plus-season-data";

/** How the example season writes numbers, ranks and journées in the reader's language. */
export function useSeasonFmt() {
  const { t, lang } = useI18n();
  return useMemo(() => {
    /** « 56,0 », « +41 », « −6 »: comma decimals, a true minus sign, Western digits in both languages. */
    const num = (n: number, decimals = 0, sign = false): string => {
      const body = Math.abs(n).toFixed(decimals).replace(".", ",");
      if (n < 0 && Number(Math.abs(n).toFixed(decimals)) !== 0) return `−${body}`;
      return sign && n > 0 ? `+${body}` : body;
    };
    /** « 3e », « 1er » in French; the bare number in Arabic (the word around it carries the meaning). */
    const ord = (n: number): string => (lang === "ar" ? String(n) : n === 1 ? "1er" : `${n}e`);
    /** « J.9 » / « الجولة 9 » as text. */
    const j = (n: number): string => t("plus.s2.j_short").replace("{n}", String(n));
    /** Axis label for the first journée: « J.1 » in French, the bare number in Arabic. */
    const jAxis = (n: number): string => t("plus.s2.j_axis").replace("{n}", String(n));
    const rankOf = (r: number, total: number): string =>
      t("plus.s2.rank_of").replace("{r}", ord(r)).replace("{n}", String(total));
    return { t, lang, num, ord, j, jAxis, rankOf };
  }, [t, lang]);
}

/** A dictionary lookup with `{name}` holes filled by strings or numbers (for `aria-label`s and short labels). */
export function useFill() {
  const { text } = usePlusCopy();
  return text;
}

/** The name of a rating (Capitaine, Titulaires, Transferts, Régularité), literal keys for the i18n gate. */
export function ratingName(t: (key: TranslationKey) => string, code: RatingCode): string {
  switch (code) {
    case "CAP":
      return t("card.stat_word.cap");
    case "SEL":
      return t("card.stat_word.sel");
    case "TRF":
      return t("card.stat_word.trf");
    case "CON":
      return t("card.stat_word.con");
  }
}
