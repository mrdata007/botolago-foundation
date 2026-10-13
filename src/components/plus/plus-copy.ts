import { createElement, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { fill, fillText } from "@/components/manager-card/interpolate";
import { pluralCategory } from "@/components/manager-card/copy";
import { useI18n } from "@/i18n/provider";
import type { TranslationKey } from "@/i18n/dictionaries";

import { PlusLogo } from "./PlusLogo";

/**
 * The name of the product as plain text. It is spoken (an `aria-label`) or sits in the browser
 * tab; on screen BotolaGO+ is always the logo (`PlusLogo`), never this string.
 */
export const PLUS_NAME = "BotolaGO+";

export const PLUS_STYLES = ["holo", "electric", "pixel", "chrome"] as const;
export type PlusStyle = (typeof PLUS_STYLES)[number];

/** The style's name in the reader's language (literal keys, so the i18n gate can see them). */
export function styleLabel(t: (key: TranslationKey) => string, style: PlusStyle): string {
  switch (style) {
    case "holo":
      return t("plus.style.holo");
    case "electric":
      return t("plus.style.electric");
    case "pixel":
      return t("plus.style.pixel");
    case "chrome":
      return t("plus.style.chrome");
  }
}

type PluralKeys = Record<"one" | "two" | "few" | "other", TranslationKey>;
const POINTS: PluralKeys = {
  one: "plus.points_one",
  two: "plus.points_two",
  few: "plus.points_few",
  other: "plus.points_other",
};
const PAYMENTS: PluralKeys = {
  one: "plus.payments_one",
  two: "plus.payments_two",
  few: "plus.payments_few",
  other: "plus.payments_other",
};
const ROUNDS: PluralKeys = {
  one: "card.rounds_one",
  two: "card.rounds_two",
  few: "card.rounds_few",
  other: "card.rounds_other",
};
export type CountKind = "points" | "payments" | "rounds";
const FAMILIES: Record<CountKind, PluralKeys> = {
  points: POINTS,
  payments: PAYMENTS,
  rounds: ROUNDS,
};

/**
 * The dictionary key of a counted noun for `n`, with the right agreement: French one / other;
 * Arabic singular for 1, dual for 2, plural for 3 to 10, singular accusative from 11.
 */
export function pluralKey(kind: CountKind, n: number, lang: string): TranslationKey {
  const category = pluralCategory(n, lang === "ar" ? "ar" : "fr");
  const family = FAMILIES[kind];
  return category === "zero" ? family.other : family[category];
}

/**
 * The current date, in the reader's time zone. The first render (server, then hydration) and the
 * second (after mount) can differ across midnight, so the date text carries
 * `suppressHydrationWarning` (`DateText`).
 */
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    setNow(new Date());
  }, []);
  return now;
}

/** A date as text in the reader's language (Western digits, Gregorian calendar in Arabic too). */
export function formatPlusDate(lang: string, date: Date, short = false): string {
  return new Intl.DateTimeFormat(
    lang === "ar" ? "ar-u-nu-latn-ca-gregory" : "fr-FR",
    short
      ? { day: "numeric", month: "short", year: "numeric" }
      : { day: "numeric", month: "long", year: "numeric" },
  ).format(date);
}

/** Words for the screens: `t`, placeholders filled, counted nouns with the right agreement. */
export function usePlusCopy() {
  const { t, lang } = useI18n();
  const logo = useMemo(() => createElement(PlusLogo, { label: PLUS_NAME }), []);
  const f = useCallback(
    (key: TranslationKey, values: Record<string, ReactNode> = {}): ReactNode =>
      fill(t(key), values),
    [t],
  );
  const text = useCallback(
    (key: TranslationKey, values: Record<string, string | number> = {}): string =>
      fillText(t(key), values),
    [t],
  );
  /** « 3 points » / « 3 نقاط »: a counted noun as text (the number isolated in Arabic). */
  const count = useCallback(
    (n: number, kind: CountKind): string => {
      return fillText(t(pluralKey(kind, n, lang)), { n });
    },
    [lang, t],
  );
  /** The same without isolation marks, for an `aria-label` that is spoken. */
  const countPlain = useCallback(
    (n: number, kind: CountKind): string => {
      return t(pluralKey(kind, n, lang)).replace("{n}", String(n));
    },
    [lang, t],
  );
  return { t, lang, logo, f, text, count, countPlain };
}
