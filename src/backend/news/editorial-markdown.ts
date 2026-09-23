// The single implementation of the CMS's simplified Markdown <-> editorial
// HTML conversion. Both news CMS routes (admin.news.new and
// admin.news.$articleEditionId) import it so the two directions cannot drift
// apart: the edit route reads `bodySource` back as Markdown, and when an
// article predates `bodySource` it reconstructs the Markdown from the stored
// HTML. A mismatch between the two directions silently deletes body content
// on the next save, so both live here and are unit tested together.
//
// This is NOT a full Markdown implementation: blank-line separated blocks
// become paragraphs (unchanged from the original behaviour),
// `![alt](https://...)` becomes a `<figure><img><figcaption>`, and a small
// set of line markers (`##` intertitles, `-`/`1.` lists, `>` quotes) plus
// `**bold**` / `*italic*` and `[text](https://... or /path)` links become
// their tags. Links in original BotolaGO stories are kept on the public page;
// imported third-party stories still lose theirs (BG-0091). Everything
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
 * inside a block is lifted out into its own `<figure>`.
 *
 * Inside a block, a line starting `## ` (or `#`, `###`, `####`) is an
 * intertitle, consecutive `- ` / `* ` lines are a bulleted list, consecutive
 * `1. ` lines a numbered list and consecutive `> ` lines a quote. `**text**`
 * is bold and `*text*` italic. The editor's own hint has promised `##` and
 * `**` since the first release, but until this was added both came out as the
 * literal characters, so a multi-section article rendered as one run of
 * paragraphs with `##` printed in them.
 *
 * Every tag produced here is already on the sanitizer allowlist and already
 * styled by `.editorial-body`. Plain prose with none of these markers still
 * becomes `<p>{trimmed block}</p>` exactly as before.
 */
export function markdownToEditorialHtml(source: string): string {
  return source
    .replace(/\r\n?/gu, "\n")
    .split(/\n{2,}/u)
    .map((block) => structuredBlockToHtml(block))
    .join("");
}

const HEADING_LINE = /^(#{1,4})[ \t]+(\S.*)$/u;
const BULLET_LINE = /^[ \t]*[-*][ \t]+(\S.*)$/u;
const NUMBERED_LINE = /^[ \t]*\d{1,3}[.)][ \t]+(\S.*)$/u;
const QUOTE_LINE = /^[ \t]*>[ \t]?(.*)$/u;

type LineKind = "heading" | "bullet" | "numbered" | "quote" | "text";

function lineKind(line: string): LineKind {
  if (HEADING_LINE.test(line)) return "heading";
  if (BULLET_LINE.test(line)) return "bullet";
  if (NUMBERED_LINE.test(line)) return "numbered";
  if (QUOTE_LINE.test(line)) return "quote";
  return "text";
}

/** Hosts that are BotolaGO itself: a link there is internal. */
const OWN_HOSTS = new Set(["botolago.com", "www.botolago.com"]);

/**
 * Whether `url` may become a link: an absolute https URL without credentials,
 * or a path on this site (`/news/...`, not the protocol-relative `//host`).
 * Everything else -- `javascript:`, `data:`, `http:`, `mailto:`, bare words --
 * is left as the literal text the editor typed. The sanitizer (client and the
 * trusted server pass) enforces the same schemes and remains the authority.
 */
export function isAllowedEditorialLinkUrl(url: string): boolean {
  const value = url.trim();
  if (/^\/(?!\/)/u.test(value)) return !/[\s\\]/u.test(value);
  return isAllowedEditorialImageUrl(value);
}

/** An https link to another site (not a path, not botolago.com). */
export function isExternalEditorialLink(url: string): boolean {
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === "https:" && !OWN_HOSTS.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

/** Matches `[text](url)` that is not an image (`![...]`). */
const LINK_PATTERN = /(?<!!)\[([^\]\n]+)\]\(([^()\s]+)\)/gu;

function emphasisToHtml(text: string): string {
  return text
    .replace(/\*\*(?=\S)([^*\n]+?)(?<=\S)\*\*/gu, "<strong>$1</strong>")
    .replace(/(^|[^\p{L}\p{N}*])\*(?=\S)([^*\n]+?)(?<=\S)\*(?![\p{L}\p{N}*])/gu, "$1<em>$2</em>");
}

/**
 * `[text](url)` links, then `**bold**` and `*italic*`. A `*` between two word
 * characters (`5*3`) is left alone, as is a marker with whitespace just
 * inside it. Emphasis runs on the text around and inside links, never on the
 * URL itself.
 */
function inlineToHtml(text: string): string {
  let result = "";
  let cursor = 0;
  LINK_PATTERN.lastIndex = 0;
  for (const match of text.matchAll(LINK_PATTERN)) {
    const [literal, label, url] = match;
    const index = match.index ?? 0;
    result += emphasisToHtml(text.slice(cursor, index));
    cursor = index + literal.length;
    if (!isAllowedEditorialLinkUrl(url)) {
      result += emphasisToHtml(literal);
      continue;
    }
    const external = isExternalEditorialLink(url);
    const attributes = external ? ' target="_blank" rel="nofollow noopener noreferrer"' : "";
    result += `<a href="${escapeHtml(url.trim())}"${attributes}>${emphasisToHtml(label)}</a>`;
  }
  return result + emphasisToHtml(text.slice(cursor));
}

function structuredBlockToHtml(block: string): string {
  const lines = block.split("\n");
  if (lines.every((line) => lineKind(line) === "text")) return blockToHtml(block);

  const pieces: string[] = [];
  let run: { kind: LineKind; lines: string[] } | null = null;
  const flush = () => {
    if (!run) return;
    const { kind, lines: runLines } = run;
    if (kind === "text") {
      const text = runLines.join("\n");
      if (text.trim()) pieces.push(blockToHtml(text));
    } else if (kind === "bullet" || kind === "numbered") {
      const pattern = kind === "bullet" ? BULLET_LINE : NUMBERED_LINE;
      const items = runLines
        .map((line) => `<li>${inlineToHtml(pattern.exec(line)![1].trim())}</li>`)
        .join("");
      pieces.push(kind === "bullet" ? `<ul>${items}</ul>` : `<ol>${items}</ol>`);
    } else if (kind === "quote") {
      const text = runLines
        .map((line) => QUOTE_LINE.exec(line)![1])
        .join("\n")
        .trim();
      if (text) pieces.push(`<blockquote><p>${inlineToHtml(text)}</p></blockquote>`);
    }
    run = null;
  };

  for (const line of lines) {
    const kind = lineKind(line);
    if (kind === "heading") {
      flush();
      const [, hashes, text] = HEADING_LINE.exec(line)!;
      // The article title is the page's only h1, so `#` and `##` are both h2.
      const level = Math.max(2, hashes.length);
      pieces.push(`<h${level}>${inlineToHtml(text.trim())}</h${level}>`);
      continue;
    }
    if (!run || run.kind !== kind) {
      flush();
      run = { kind, lines: [] };
    }
    run.lines.push(line);
  }
  flush();
  return pieces.join("");
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
      if (pending.trim()) pieces.push(`<p>${inlineToHtml(pending.trim())}</p>`);
      pending = "";
      pieces.push(figureHtml(url, altText));
    } else {
      // Not an image we are willing to emit: leave the author's text alone.
      pending += literal;
    }
    match = IMAGE_PATTERN.exec(block);
  }

  if (pieces.length === 0) return `<p>${inlineToHtml(block.trim())}</p>`;

  pending += block.slice(cursor);
  if (pending.trim()) pieces.push(`<p>${inlineToHtml(pending.trim())}</p>`);
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
    .replace(
      /<h([2-4])\b[^>]*>([\s\S]*?)<\/h\1\s*>/giu,
      (_, level: string, text: string) =>
        `\n\n${"#".repeat(Number(level))} ${inlineToMarkdown(text).trim()}\n\n`,
    )
    .replace(
      /<(ul|ol)\b[^>]*>([\s\S]*?)<\/\1\s*>/giu,
      (_, tag: string, items: string) => `\n\n${listToMarkdown(tag, items)}\n\n`,
    )
    .replace(
      /<blockquote\b[^>]*>([\s\S]*?)<\/blockquote\s*>/giu,
      (_, inner: string) =>
        `\n\n${inlineToMarkdown(inner.replace(/<\/p>\s*<p>/giu, "\n").replace(/<\/?p>/giu, ""))
          .trim()
          .split("\n")
          .map((line) => `> ${line}`)
          .join("\n")}\n\n`,
    )
    .replace(
      /<p\b[^>]*>([\s\S]*?)<\/p\s*>/giu,
      (_, inner: string) => `\n\n${inlineToMarkdown(inner)}\n\n`,
    )
    .replace(/<\/?p>/giu, "")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

/** `<strong>`/`<b>` and `<em>`/`<i>` back to the markers {@link inlineToHtml} reads. */
function inlineToMarkdown(html: string): string {
  return html
    .replace(/<a\b([^>]*)>([\s\S]*?)<\/a\s*>/giu, (anchor, attributes: string, label: string) => {
      const href = readAttribute(`<a${attributes}>`, "href");
      if (!href || !isAllowedEditorialLinkUrl(href)) return label;
      return `[${label.replace(/[[\]]/gu, "")}](${href.replace(/\(/gu, "%28").replace(/\)/gu, "%29")})`;
    })
    .replace(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1\s*>/giu, "**$2**")
    .replace(/<(em|i)\b[^>]*>([\s\S]*?)<\/\1\s*>/giu, "*$2*");
}

function listToMarkdown(tag: string, items: string): string {
  const entries = [...items.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li\s*>/giu)].map((match) =>
    inlineToMarkdown(match[1].replace(/<\/?p>/giu, ""))
      .replace(/\s+/gu, " ")
      .trim(),
  );
  return entries
    .map((entry, index) => (tag.toLowerCase() === "ol" ? `${index + 1}. ${entry}` : `- ${entry}`))
    .join("\n");
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
