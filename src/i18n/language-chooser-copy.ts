// The first-launch language chooser shows both languages before one is
// chosen. Its Arabic lines are copied here so a first visit does not
// download the whole Arabic dictionary just to draw them;
// `language-chooser-copy.test.ts` fails if they drift from dictionary-ar.ts.
//
// The last four are what a reader sees when that download fails (in the
// chooser, and in the provider's notice to a returning reader), so they are
// the ones that must never depend on it: the news that the Arabic dictionary
// did not arrive cannot come from the Arabic dictionary.
export const CHOOSER_ARABIC = {
  "app.tagline": "أخبار وفانتازي كرة القدم المغربية",
  "language.choose_title": "اختر لغتك",
  "language.continue": "متابعة",
  "language.arabic_loading": "جارٍ تحميل العربية…",
  "language.arabic_failed": "تعذّر تحميل العربية. تحقّق من اتصالك ثم أعد المحاولة.",
  "state.retry": "إعادة المحاولة",
  "toast.close": "إغلاق الإشعار",
} as const;
