// Text normalisation shared by entity resolution, deduplication and the
// originality gate.
//
// `normalizeEntityName` must stay character-for-character equivalent to
// `app_private.news_engine_normalize_name` in the database. Both sides look up
// the same alias table, so a disagreement about what "the same name" means
// silently stops resolving clubs. The SQL version is the authority; this is
// its mirror, and `normalization/text.test.ts` pins the pairs that matter.

const LATIN_FOLD_FROM = "àáâãäåèéêëìíîïòóôõöùúûüýÿñçšžāēīōūğıś";
const LATIN_FOLD_TO = "aaaaaaeeeeiiiiooooouuuuyyncszaeiougis";

// Arabic diacritics (harakat), the superscript alef, and the tatweel
// elongation character. Removed outright: they carry no identity.
//
// Held as escaped code points in a plain string rather than as a regex
// character class: these are combining marks, and a source file containing
// them literally is both unreadable and reformatting-fragile.
const ARABIC_DIACRITICS = "ًٌٍَُِّْـٰ";

// Zero-width and bidirectional control characters. They survive copy and
// paste from a rendered page and would otherwise make two identical texts
// hash differently. Built from escapes so the source stays readable.
const INVISIBLE_CHARACTERS = new RegExp("[\\u200B-\\u200F\\u202A-\\u202E\\uFEFF]", "gu");

// Letter variants that Moroccan sports reporting uses interchangeably.
const ARABIC_FOLD_FROM = "أإآٱىةؤئ";
const ARABIC_FOLD_TO = "اااايهءء";

function translate(value: string, from: string, to: string): string {
  let result = "";
  for (const character of value) {
    const index = from.indexOf(character);
    result += index === -1 ? character : (to[index] ?? "");
  }
  return result;
}

/**
 * Case-folds, flattens Latin accents, strips Arabic diacritics and tatweel,
 * unifies the alef/ya/ta-marbuta variants, reduces punctuation to spaces and
 * collapses whitespace.
 *
 * Returns an empty string when nothing survives, which callers treat as
 * "unresolvable" rather than as a match against an empty alias.
 */
export function normalizeEntityName(value: string | null | undefined): string {
  if (!value) return "";
  const lowered = value.toLowerCase().replaceAll("œ", "oe").replaceAll("æ", "ae");
  const latinFolded = translate(lowered, LATIN_FOLD_FROM, LATIN_FOLD_TO);
  const arabicStripped = translate(latinFolded, ARABIC_DIACRITICS, "");
  const arabicFolded = translate(arabicStripped, ARABIC_FOLD_FROM, ARABIC_FOLD_TO);
  return arabicFolded
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

/**
 * Collapses an article body to comparable plain text: HTML entities decoded,
 * tags removed, whitespace normalised. Used for hashing and for the
 * originality comparison, never for display.
 */
export function normalizeArticleText(value: string): string {
  return (
    value
      .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/giu, " ")
      .replace(/<[^>]+>/gu, " ")
      .replaceAll("&nbsp;", " ")
      .replaceAll("&amp;", "&")
      .replaceAll("&lt;", "<")
      .replaceAll("&gt;", ">")
      .replaceAll("&quot;", '"')
      .replaceAll("&#39;", "'")
      .replace(INVISIBLE_CHARACTERS, "")
      .replace(/[ \t\u00A0]+/gu, " ")
      // Trim each line without touching the newlines themselves, so paragraph
      // breaks survive — they are real structure for extraction and for the
      // sentence-level originality comparison.
      .replace(/[ \t]*\r?\n[ \t]*/gu, "\n")
      .replace(/\n{3,}/gu, "\n\n")
      .trim()
  );
}

/**
 * Word tokens for n-gram overlap. Arabic has no casing and few separators the
 * Latin tokeniser would find, so both scripts go through the same
 * letter-or-digit run split.
 */
export function tokenize(value: string): string[] {
  const normalized = normalizeEntityName(value);
  if (!normalized) return [];
  return normalized.split(" ").filter((token) => token.length > 0);
}

/** Overlapping n-grams of `size` tokens, joined by a space. */
export function ngrams(tokens: readonly string[], size: number): string[] {
  if (size < 1 || tokens.length < size) return [];
  const result: string[] = [];
  for (let index = 0; index + size <= tokens.length; index += 1) {
    result.push(tokens.slice(index, index + size).join(" "));
  }
  return result;
}

/** Splits text into sentences across Latin and Arabic punctuation. */
export function splitSentences(value: string): string[] {
  return value
    .split(/(?<=[.!?؟。])\s+|\n+/u)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

/**
 * A stable slug for an article title. Arabic titles produce no Latin
 * characters at all, so the caller must supply a fallback prefix; a slug of
 * pure transliteration guesswork would be worse than an explicit key.
 */
export function slugify(value: string, maxLength = 90): string {
  const base = normalizeEntityName(value)
    .replace(/[^\p{Script=Latin}\p{N}\s]+/gu, " ")
    .replace(/\s+/gu, "-")
    .replace(/-+/gu, "-")
    .replace(/^-|-$/gu, "");
  return base.slice(0, maxLength).replace(/-+$/u, "");
}
