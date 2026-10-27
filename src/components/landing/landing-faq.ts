import type { TranslationKey } from "@/i18n/dictionaries";

/**
 * The questions of the landing page's FAQ, in the order they are shown. The
 * page renders them and `/jouer` marks them up as `FAQPage` data from this
 * one list, so the markup cannot drift from the visible text. The prize
 * question is only listed while prizes are enabled.
 */
export interface LandingFaqItem {
  readonly question: string;
  readonly answer: string;
}

/** `t` from `useI18n()`, or a reader of the French dictionary for `head()`. */
type Translate = (key: TranslationKey) => string;

export function landingFaqItems(t: Translate, opts: { prizes: boolean }): LandingFaqItem[] {
  const items: LandingFaqItem[] = [
    { question: t("landing.faq_what_q"), answer: t("landing.faq_what_a") },
    { question: t("landing.faq_free_q"), answer: t("landing.faq_free_a") },
    { question: t("landing.faq_create_q"), answer: t("landing.faq_create_a") },
    { question: t("landing.faq_squad_q"), answer: t("landing.faq_squad_a") },
    { question: t("landing.faq_points_q"), answer: t("landing.faq_points_a") },
    { question: t("landing.faq_transfers_q"), answer: t("landing.faq_transfers_a") },
    { question: t("landing.faq_deadline_q"), answer: t("landing.faq_deadline_a") },
  ];
  if (opts.prizes) {
    items.push({ question: t("landing.faq_prizes_q"), answer: t("landing.faq_prizes_a") });
  }
  items.push(
    { question: t("landing.faq_late_q"), answer: t("landing.faq_late_a") },
    { question: t("landing.faq_account_q"), answer: t("landing.faq_account_a") },
  );
  return items;
}
