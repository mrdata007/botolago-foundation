/**
 * An article's text as a reader sees it, for the helpers that compare one copy
 * of it with another: the page deciding whether the deck repeats the body's
 * opening (`components/news/article-lead.ts`), and the head recognising the
 * import's clipped SEO copies (`article-meta.ts`). Both meet the same
 * differences a reader cannot see: markup, entities (some imported summaries
 * even carry `&amp;quot;` as literal text), no-break spaces, runs of spaces.
 */

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  laquo: "«",
  raquo: "»",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  hellip: "…",
  ndash: "–",
  mdash: "—",
};

function decodeEntitiesOnce(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, name: string) => {
    if (name[0] === "#") {
      const code =
        name[1]?.toLowerCase() === "x" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return Number.isInteger(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : entity;
    }
    return NAMED_ENTITIES[name.toLowerCase()] ?? entity;
  });
}

/**
 * The text of an HTML fragment: tags dropped (a `<br>` is a space), entities
 * decoded, white space collapsed. Entities are decoded until nothing changes,
 * at most three times, for the double-encoded ones.
 */
export function readerText(html: string): string {
  let text = html.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]*>/g, "");
  for (let pass = 0; pass < 3; pass += 1) {
    const decoded = decodeEntitiesOnce(text);
    if (decoded === text) break;
    text = decoded;
  }
  return text.replace(/\s+/g, " ").trim();
}

/**
 * `readerText`, folded for comparing two copies: Unicode compatibility forms
 * too (a no-break space is a space, "…" is three dots). For comparing only:
 * what is shown or emitted stays the reader text.
 */
export function comparableText(html: string): string {
  return readerText(html).normalize("NFKC").replace(/\s+/g, " ").trim();
}

/** The text before a trailing ellipsis ("…" or "..."), or `null` when there is none. */
export function ellipsisStem(text: string): string | null {
  const match = /^(.*?)\s*(?:…|\.\.\.)$/.exec(text);
  return match ? match[1] : null;
}

/** Elements that end one run of body text and start the next. */
const BLOCK_BOUNDARY = /<\/?(?:p|h[1-6]|li|ul|ol|blockquote|figure|figcaption|hr)\b[^>]*>/i;

/**
 * The body's text, one entry per paragraph (or heading, list item, caption),
 * in reading order and without the empty ones. The imported archive's body is
 * one `<p>` per paragraph of the original article.
 */
export function bodyParagraphs(bodyHtml: string): string[] {
  return bodyHtml
    .split(BLOCK_BOUNDARY)
    .map(readerText)
    .filter((paragraph) => paragraph.length > 0);
}
