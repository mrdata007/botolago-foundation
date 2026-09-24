/**
 * The player hero sets the name in two weights, as the A-Player board does:
 * the first name light above, the family name heavy and large below. The
 * data has one string per language, so the split is typographic — the first
 * word, then the rest — and a one-word name is all family name. It is never
 * used to decide anything; the full name is still the element's text.
 */
export function splitPlayerName(full: string): { first: string | null; last: string } {
  const words = full.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 1) return { first: null, last: words[0] ?? "" };
  return { first: words[0], last: words.slice(1).join(" ") };
}

/**
 * Which display step the family name takes. The hero step (46px) holds about
 * twelve characters beside the club disc at 390px; a longer name steps down
 * to the title step (34px) so it keeps to two lines instead of three.
 */
export function surnameStep(last: string): "hero" | "title" {
  return [...last].length > 12 ? "title" : "hero";
}
