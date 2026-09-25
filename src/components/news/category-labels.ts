// The five category names `categoryLabel` translates, in Arabic, for an
// Arabic article read in the French interface (the pill speaks the article's
// language). Copied so an article page does not download the whole Arabic
// dictionary for one pill; category-labels.test.ts keeps them equal to
// dictionary-ar.ts.
export const ARABIC_CATEGORY_LABELS: Readonly<Record<string, string>> = {
  "news.tab.for_you": "مقترح لك",
  "news.tab.latest": "آخر الأخبار",
  "news.tab.transfers": "سوق الانتقالات",
  "news.tab.analysis": "تحليلات",
  "news.tab.interviews": "مقابلات",
};
