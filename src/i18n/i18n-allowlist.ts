import type { TranslationKey } from "./dictionaries";

/**
 * BG-0014 — justified exceptions for the localization gate
 * (`scripts/qa/i18n-gate.ts`).
 *
 * These lists never change a warning count. They annotate it: an allow-listed
 * finding is printed as `suppressed` together with the justification below, an
 * unlisted one is printed by name. That is deliberate: before BG-0024 repaired
 * its copy, `profile.title` surfaced as a named W1/W2 warning, never absorbed.
 *
 * Both lists are `satisfies Partial<Record<TranslationKey, string>>`, so
 * renaming or deleting a dictionary key breaks `bun run typecheck` here instead
 * of leaving a silently dead suppression behind.
 */

/** W1 — keys whose fr and ar values are identical on purpose. */
export const IDENTICAL_ALLOWED = {
  "app.name": "Brand name; deliberately untranslated in both languages.",
  "language.french": "Endonym: the French option is labelled 'Français' in the Arabic UI too.",
  "language.arabic": "Endonym: the Arabic option is labelled 'العربية' in the French UI too.",
  "notfound.code": "HTTP status code 404, not natural-language copy.",
  "auth.register.accept_terms.tail":
    "Sentence-final full stop of the consent sentence, split out so the two document names can be links; a full stop is '.' in both languages.",
  "auth.terms_notice.tail":
    "Sentence-final full stop of the consent notice, split out so the two document names can be links; a full stop is '.' in both languages.",
  "fantasy.stat.none":
    "BG-0071 — an en dash standing for 'no value yet' in a numeric stat cell. Punctuation, not copy; an Arabic-script substitute would read as a character rather than as an absent number.",
} as const satisfies Partial<Record<TranslationKey, string>>;

/** W2 — ar values that legitimately contain no Arabic script. */
export const NO_ARABIC_SCRIPT_ALLOWED = {
  "app.name": "Brand name in Latin script by design.",
  "language.french": "French endonym, written in Latin script by definition.",
  "language.arabic": "Endonym; already Arabic script, listed for symmetry with W1.",
  "notfound.code": "Numeric HTTP status code.",
  "auth.email_placeholder": "Example email address; an address is not localized.",
  "auth.register.accept_terms.tail": "A full stop carries no script.",
  "auth.terms_notice.tail": "A full stop carries no script.",
  "fantasy.stat.none": "An en dash carries no script.",
} as const satisfies Partial<Record<TranslationKey, string>>;
