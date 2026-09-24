// The first-launch language chooser shows both languages before one is
// chosen. Its three Arabic lines are copied here so a first visit does not
// download the whole Arabic dictionary just to draw them;
// `language-chooser-copy.test.ts` fails if they drift from dictionary-ar.ts.
export const CHOOSER_ARABIC = {
  "app.tagline": "أخبار وفانتازي كرة القدم المغربية",
  "language.choose_title": "اختر لغتك",
  "language.continue": "متابعة",
} as const;
