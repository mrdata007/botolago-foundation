/**
 * Test support for the shield's tests: the app's own card words in both languages and a profile
 * per case. Not imported by the app.
 */
import { FIXTURES } from "@/backend/manager-card/fixtures";
import { dictionaries, type TranslationKey } from "@/i18n/dictionaries";

import { cardStrings, type Translate } from "../copy";
import { fromMyCard } from "../to-profile";
import type { CardProfile, CardStrings } from "../types";

const tFor =
  (lang: "fr" | "ar"): Translate =>
  (key: TranslationKey) =>
    (dictionaries[lang] as Record<string, string>)[key] ?? key;

export const STRINGS: Readonly<Record<"fr" | "ar", CardStrings>> = {
  fr: cardStrings(tFor("fr"), "fr"),
  ar: cardStrings(tFor("ar"), "ar"),
};

export const rated: CardProfile = fromMyCard(FIXTURES.rated.card!);
export const forming: CardProfile = fromMyCard(FIXTURES.forming1.card!);
export const founder: CardProfile = fromMyCard(FIXTURES.founder.card!);
export const arabicName: CardProfile = fromMyCard(FIXTURES.arabicName.card!);
export const longName: CardProfile = fromMyCard(FIXTURES.longNameLatin.card!);
export const noClub: CardProfile = fromMyCard(FIXTURES.clubNull.card!);

/** The text content of the first element with `cls` in its class list. */
export function textOf(html: string, cls: string): string | null {
  const match = new RegExp(`class="[^"]*\\b${cls}\\b[^"]*"[^>]*>(.*?)</span>`).exec(html);
  return match ? match[1]!.replace(/<[^>]+>/g, "") : null;
}

/** Every class used in the markup. */
export const classesOf = (html: string): Set<string> =>
  new Set([...html.matchAll(/class="([^"]*)"/g)].flatMap((m) => m[1]!.split(/\s+/)));
