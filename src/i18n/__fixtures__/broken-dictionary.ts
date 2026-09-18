/**
 * BG-0014 — deliberately broken two-language dictionary.
 *
 * Hand-written, NOT derived from `src/i18n/dictionaries.ts`: its only job is to
 * exercise the gate's exit-1 path, so it must stay small and stay wrong. Each
 * defect below is injected on purpose; do not "fix" them.
 *
 *   fixture.only_fr      E1  present in fr only
 *   fixture.empty        E2  ar value is whitespace only
 *   fixture.placeholder  E3  fr uses {name}, ar uses {user}
 *   fixture.accent       E4  ar opens {accent} and never closes it
 *   fixture.identical    W1  fr and ar are the same string (and W2: no Arabic)
 */

export const brokenDictionaries: Record<"fr" | "ar", Record<string, string>> = {
  fr: {
    "fixture.ok": "Bonjour",
    "fixture.only_fr": "Uniquement en français",
    "fixture.empty": "Vide",
    "fixture.placeholder": "Bonjour {name}",
    "fixture.accent": "Voir {accent}tout{/accent}",
    "fixture.identical": "BotolaGO",
  },
  ar: {
    "fixture.ok": "مرحبا",
    "fixture.empty": "   ",
    "fixture.placeholder": "مرحبا {user}",
    "fixture.accent": "عرض {accent}الكل",
    "fixture.identical": "BotolaGO",
  },
};

/**
 * Baselines for the fixture, audited with an empty usage index and empty
 * allow-lists: W1 fixture.identical; W2 fixture.identical + fixture.empty;
 * W3 all six fr keys are unreferenced; W4 no t() call sites.
 */
export const BROKEN_FIXTURE_BASELINES = {
  W1: 1,
  W2: 2,
  W3: 6,
  W4: 0,
} as const;
