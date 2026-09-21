// The single implementation of the CMS's simplified Markdown <-> editorial
// HTML conversion. Both news CMS routes (admin.news.new and
// admin.news.$articleEditionId) import it so the two directions cannot drift
// apart: the edit route reads `bodySource` back as Markdown, and when an
// article predates `bodySource` it reconstructs the Markdown from the stored
// HTML. A mismatch between the two directions silently deletes body content
// on the next save, so both live here and are unit tested together.
//
// This is NOT a full Markdown implementation: blank-line separated blocks
// become paragraphs (unchanged from the original behaviour) and
// `![alt](https://...)` becomes a `<figure><img><figcaption>`. Everything
// produced here is still run through `sanitizeEditorialHtml` before it ever
// leaves the browser, and re-sanitized server-side by the Edge Function that
// owns the actual trust boundary -- the https-only check below is a second
// line of defence, not the authority.

/** Matches `![alt](url)`; the URL may not contain whitespace or parentheses. */
const IMAGE_PATTERN = /!\[([^\]]*)\]\(([^()\s]+)\)/gu;

const FIGURE_PATTERN = /<figure\b[^>]*>[\s\S]*?<\/figure\s*>/giu;
const IMG_PATTERN = /<img\b[^>]*>/giu;

function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&#39;");
}

function decodeHtml(value: string): string {
  return value
    .replace(/&lt;/giu, "<")
    .replace(/&gt;/giu, ">")
    .replace(/&quot;/giu, '"')
    .replace(/&#0*39;|&apos;/giu, "'")
    .replace(/&amp;/giu, "&");
}

/**
 * Only absolute https URLs may become an `<img>`. The sanitizer enforces the
 * same rule (`allowedSchemes: ["https"]`) and remains the authority, but a
 * `javascript:` or `http:` URL must never reach it as an image in the first
 * place.
 */
export function isAllowedEditorialImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === "https:" && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

/**
 * The Markdown snippet an editor's inserted image is represented by.
 *
 * The alt text is flattened to a single line and the URL's parentheses are
 * percent-encoded, because both would otherwise produce markdown this module
 * cannot read back: `IMAGE_PATTERN` stops a URL at the first parenthesis, and
 * a blank line inside the alt splits the literal across two blocks. In either
 * case the next save turns the editor's image into plain text -- exactly the
 * silent content loss this module exists to prevent.
 */
export function editorialImageMarkdown(url: string, altText: string): string {
  const alt = altText.replace(/[[\]]/gu, "").replace(/\s+/gu, " ").trim();
  const href = url.trim().replace(/\(/gu, "%28").replace(/\)/gu, "%29");
  return `![${alt}](${href})`;
}

function figureHtml(url: string, altText: string): string {
  const alt = altText.trim();
  const caption = alt ? `<figcaption>${escapeHtml(alt)}</figcaption>` : "";
  return `<figure><img src="${escapeHtml(url.trim())}" alt="${escapeHtml(alt)}" />${caption}</figure>`;
}

/**
 * Blank-line separated blocks become `<p>`; a `![alt](https://...)` anywhere
 * inside a block is lifted out into its own `<figure>`. A block that contains
 * no usable image keeps the exact original behaviour (`<p>{trimmed block}</p>`)
 * so previously stored content renders identically.
 */
export function markdownToEditorialHtml(source: string): string {
  return source
    .split(/\n{2,}/u)
    .map((block) => blockToHtml(block))
    .join("");
}

function blockToHtml(block: string): string {
  IMAGE_PATTERN.lastIndex = 0;
  const pieces: string[] = [];
  let pending = "";
  let cursor = 0;
  let match: RegExpExecArray | null = IMAGE_PATTERN.exec(block);

  while (match) {
    const [literal, altText, url] = match;
    pending += block.slice(cursor, match.index);
    cursor = match.index + literal.length;
    if (isAllowedEditorialImageUrl(url)) {
      if (pending.trim()) pieces.push(`<p>${pending.trim()}</p>`);
      pending = "";
      pieces.push(figureHtml(url, altText));
    } else {
      // Not an image we are willing to emit: leave the author's text alone.
      pending += literal;
    }
    match = IMAGE_PATTERN.exec(block);
  }

  if (pieces.length === 0) return `<p>${block.trim()}</p>`;

  pending += block.slice(cursor);
  if (pending.trim()) pieces.push(`<p>${pending.trim()}</p>`);
  return pieces.join("");
}

function readAttribute(tag: string, name: string): string | undefined {
  // The attribute name must start a name, not merely end one. `\b` is not
  // enough: a hyphen is a non-word character, so `\bsrc` happily matches
  // inside `data-src`, and the reader would return the first attribute whose
  // name merely ended with the one asked for -- picking `data-src` over the
  // real `src` and silently rewriting an image to a different URL on save.
  const pattern = new RegExp(`(?:^|[\\s/])${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "iu");
  const match = pattern.exec(tag);
  if (!match) return undefined;
  return decodeHtml(match[2] ?? match[3] ?? "");
}

const FIGCAPTION_PATTERN = /<figcaption\b[^>]*>([\s\S]*?)<\/figcaption\s*>/iu;

function imageBlockToMarkdown(html: string): string {
  const tag = IMG_PATTERN.exec(html);
  IMG_PATTERN.lastIndex = 0;
  const src = tag ? readAttribute(tag[0], "src") : undefined;
  const alt = (tag ? readAttribute(tag[0], "alt") : undefined) ?? "";

  // Legacy content can carry a caption that says more than the alt text --
  // this module generates the two identically, but an ingested article need
  // not. Reading only `alt` silently deleted that sentence on the next save,
  // so prefer whatever the reader actually sees.
  const captionMatch = FIGCAPTION_PATTERN.exec(html);
  const caption = captionMatch ? decodeHtml(stripTags(captionMatch[1])).trim() : "";
  const text = caption || alt;

  if (!src || !isAllowedEditorialImageUrl(src)) {
    // The image cannot be represented, but its caption is still the author's
    // prose. Keep it as text rather than dropping the block entirely.
    return text ? `\n\n${text}\n\n` : "";
  }
  return `\n\n${editorialImageMarkdown(src, text)}\n\n`;
}

function stripTags(value: string): string {
  return value.replace(/<[^>]*>/gu, "");
}

/**
 * Reverses {@link markdownToEditorialHtml} well enough that opening a stored
 * article and re-saving it is lossless for paragraphs and images. Used only
 * when an article has no `bodySource` (pre-Markdown content).
 */
export function editorialHtmlToMarkdown(html: string): string {
  return html
    .replace(FIGURE_PATTERN, (figure) => imageBlockToMarkdown(figure))
    .replace(IMG_PATTERN, (tag) => imageBlockToMarkdown(tag))
    .replace(/<\/p>\s*<p>/giu, "\n\n")
    .replace(/<\/?p>/giu, "")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

export interface MarkdownInsertion {
  readonly value: string;
  readonly caret: number;
}

/**
 * Splices `snippet` into `value` at the current textarea selection, padding it
 * with the blank lines the block-level converter needs, and reports where the
 * caret should land afterwards.
 */
export function insertMarkdownBlockAtSelection(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  snippet: string,
): MarkdownInsertion {
  const start = Math.max(0, Math.min(selectionStart, value.length));
  const end = Math.max(start, Math.min(selectionEnd, value.length));
  const before = value.slice(0, start);
  const after = value.slice(end);

  const leading =
    before.length === 0 || before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
  const trailing =
    after.length === 0 || after.startsWith("\n\n") ? "" : after.startsWith("\n") ? "\n" : "\n\n";
  const insertion = `${leading}${snippet}${trailing}`;

  // The caret lands directly after the snippet (before any padding blank
  // line) so the editor can keep typing about the image they just inserted.
  return {
    value: `${before}${insertion}${after}`,
    caret: start + leading.length + snippet.length,
  };
}
