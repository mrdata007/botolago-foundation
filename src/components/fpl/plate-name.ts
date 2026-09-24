/**
 * The name a pitch plate shows: the surname, which the data does not mark, so
 * it is taken to be the last word of the full name ("Yahya Attiat-Allah" →
 * "Attiat-Allah"). In French the compounds are hyphenated and stay whole.
 *
 * Arabic writes the same compounds with a space — "يحيى عطية الله",
 * "أنس صلاح الدين" — and the last word alone is then "الله" or "الدين",
 * which is not a person's name; nor is the name of God that follows عبد
 * ("عبد الصمد" → "الصمد"). In those cases the word before travels with it.
 *
 * Everything else keeps the last word, so the two languages agree: "Abdelhak
 * Ben Nasser" is "Nasser" in French and "عبد الحق بن ناصر" is "ناصر".
 */
const TAILS = new Set(["الله", "الدين"]);
const HEAD = "عبد";

export function plateName(fullName: string): string {
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  const last = words.at(-1);
  if (!last) return fullName;
  const previous = words.at(-2);
  if (previous && (TAILS.has(last) || previous === HEAD)) return `${previous} ${last}`;
  return last;
}
