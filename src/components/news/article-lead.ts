import { comparableText, ellipsisStem } from "@/lib/article-text";

/**
 * Where an article's lead is shown, so that it is shown once (audit A11).
 *
 * The page sets a deck under the headline: the edition's subtitle, else its
 * summary. The imported archive derives the summary from the body's own
 * opening paragraph, so on 15,273 of the 15,690 published editions the deck
 * and the first paragraph are the same text and the reader got it twice; on
 * 396 more the summary is that paragraph cut at 300 characters and closed
 * with an ellipsis, so the reader got a clipped copy and then the whole of it.
 *
 * This decides the presentation only. The stored body is never rewritten or
 * shortened: the duplicate that gives way is always the deck, the copy, and
 * the paragraph stays in the body exactly as stored.
 *
 * The deck is compared with the body's first paragraph: its first `<p>` at
 * the top level, which is what `LEAD_IN_BODY_CLASS` (`p:first-of-type`)
 * reaches. A heading or a figure before it does not hide the repeat; a
 * paragraph inside a quote or a list is not the body's first paragraph.
 *
 *   - `deck`: the deck is its own text (an editor's subtitle, a summary
 *     written apart from the body, or one that merely starts the same way).
 *     Deck and body both show, as before.
 *   - `body`: the first paragraph is the deck's very text. The deck is not
 *     drawn; the page gives that paragraph the deck's weight, so the lead
 *     still reads as the lead.
 *   - `none`: no deck to show. Either there is none, or it is the first
 *     paragraph cut short, which the body then carries in full. That
 *     paragraph is ordinary body copy: at over 300 characters it is not a
 *     standfirst.
 */
export type ArticleLeadPlacement = "deck" | "body" | "none";

/**
 * A clipped deck must keep at least this much of the paragraph before its
 * ellipsis to count as a copy of it: a few words and a "…" are a teaser an
 * editor wrote, not a cut.
 */
const MIN_CLIPPED_STEM = 24;

/** Elements with no closing tag, which the sanitizer allows (see sanitizer-policy.ts). */
const VOID_ELEMENTS = new Set(["br", "img", "hr"]);

/**
 * The inner HTML of the body's first top-level `<p>`, else `null`. Opening
 * and closing tags are counted to know the depth; the sanitizer allows no
 * attribute on `<p>` and a paragraph cannot contain another, so the first
 * `</p>` after it closes it.
 */
export function firstParagraphHtml(bodyHtml: string): string | null {
  const tags = /<(\/?)([a-z][a-z0-9]*)\b[^>]*>/gi;
  let depth = 0;
  for (let tag = tags.exec(bodyHtml); tag; tag = tags.exec(bodyHtml)) {
    const [whole, closing, rawName] = tag;
    const name = rawName.toLowerCase();
    if (VOID_ELEMENTS.has(name) || whole.endsWith("/>")) continue;
    if (closing) {
      depth = Math.max(0, depth - 1);
    } else if (depth === 0 && name === "p") {
      const end = /<\/p\s*>/gi;
      end.lastIndex = tags.lastIndex;
      const close = end.exec(bodyHtml);
      return close ? bodyHtml.slice(tags.lastIndex, close.index) : null;
    } else {
      depth += 1;
    }
  }
  return null;
}

export function articleLeadPlacement(
  deck: string | null | undefined,
  bodyHtml: string,
): ArticleLeadPlacement {
  const lead = deck ? comparableText(deck) : "";
  if (!lead) return "none";
  const paragraphHtml = firstParagraphHtml(bodyHtml);
  if (paragraphHtml === null) return "deck";
  const paragraph = comparableText(paragraphHtml);
  if (paragraph === lead) return "body";
  const stem = ellipsisStem(lead);
  if (
    stem !== null &&
    stem.length >= MIN_CLIPPED_STEM &&
    paragraph.length > stem.length &&
    paragraph.startsWith(stem)
  ) {
    return "none";
  }
  return "deck";
}
