import { useI18n } from "@/i18n/provider";

import { formatPlusDate } from "./plus-copy";

/** A date, isolated so a neighbouring word cannot reorder it. */
export function DateText({ date, short = false }: { date: Date; short?: boolean }) {
  const { lang } = useI18n();
  return <bdi suppressHydrationWarning>{formatPlusDate(lang, date, short)}</bdi>;
}

/** A price: the number and the currency are one left-to-right unit; the unit of time stays outside it. */
export function Money({ amount, decimals = false }: { amount: number; decimals?: boolean }) {
  const { lang } = useI18n();
  const text = new Intl.NumberFormat(lang === "ar" ? "ar-MA-u-nu-latn" : "fr-MA", {
    maximumFractionDigits: 2,
    minimumFractionDigits: decimals ? 2 : 0,
  }).format(amount);
  return <bdi dir="ltr">{text} MAD</bdi>;
}
