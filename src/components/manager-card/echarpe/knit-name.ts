/**
 * What gets knitted from a name (plan 6.4.1). The app has one name string; its SCRIPT chooses the
 * chart (Latin capitals or Arabic) and the INTERFACE language chooses the mirroring. Nothing here
 * touches a chart, so the cheap height estimate can use it without loading the renderer.
 */

/** The longest name knitted, in characters. */
export const MAX_NAME_CHARS = 24;

export type NameScript = "latin" | "arabic" | "none";
export interface KnitName {
  script: NameScript;
  text: string;
}

const isArabicLetter = (ch: string): boolean => /\p{Script=Arabic}/u.test(ch) && /\p{L}/u.test(ch);

/** Latin letters outside A-Z that NFD cannot take apart, as a knitter would write them. */
const LATIN_FOLD: Readonly<Record<string, string>> = {
  Æ: "AE",
  Œ: "OE",
  Ø: "O",
  Ł: "L",
  Đ: "D",
  Ð: "D",
  Þ: "TH",
  İ: "I",
};

/** Cuts at a word boundary when it can (a long single word is cut where it is). */
function cutAtWord(text: string): string {
  if (text.length <= MAX_NAME_CHARS) return text;
  const head = text.slice(0, MAX_NAME_CHARS);
  const next = text[MAX_NAME_CHARS];
  const space = head.lastIndexOf(" ");
  const cut = next === " " || next === "-" || space < 1 ? head : head.slice(0, space);
  return cut.replace(/[\s-]+$/u, "");
}

/**
 * The text that gets knitted, and in which script. Trim, collapse spaces, drop emoji and symbols;
 * Arabic letters make it an Arabic name (letters and spaces only, no tatweel or harakat); anything
 * else is Latin (accents folded, uppercased, A-Z, space and hyphen). At most 24 characters.
 */
export function knitName(raw: string): KnitName {
  const cleaned = String(raw ?? "")
    .normalize("NFKC")
    .replace(/[\p{Extended_Pictographic}\p{S}]/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
  if ([...cleaned].some(isArabicLetter)) {
    const arabic = [...cleaned]
      .filter((ch) => ch === " " || (isArabicLetter(ch) && !/[ً-ٟـ]/u.test(ch)))
      .join("")
      .replace(/\s+/gu, " ")
      .trim();
    const text = cutAtWord(arabic);
    return text ? { script: "arabic", text } : { script: "none", text: "" };
  }
  const latin = cleaned
    .replace(/\p{Pd}/gu, "-")
    .toUpperCase()
    .replace(/[ÆŒØŁĐÐÞİ]/gu, (c) => LATIN_FOLD[c] ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^A-Z -]/gu, "")
    .replace(/\s+/gu, " ")
    .replace(/-+/gu, "-")
    .replace(/^[\s-]+|[\s-]+$/gu, "")
    .replace(/ ?- ?/gu, "-");
  const text = cutAtWord(latin);
  return text ? { script: "latin", text } : { script: "none", text: "" };
}
