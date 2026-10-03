// Article parsing.
//
// Order of preference, as the architecture requires: structured metadata the
// publisher declares for machines (JSON-LD, then Open Graph / meta tags)
// before any inference from markup. Falling back to HTML is a last resort and
// the parse route is recorded so parser quality is measurable per source.
//
// The output is plain text. Source HTML is never retained: the engine needs
// facts and a comparison corpus, not a copy of someone else's page.

import { type NewsSourceLanguage, NewsEngineError, type ParsedArticle } from "../contracts";
import { normalizeArticleText } from "../normalization/text";

/** Markup that never contains article prose. */
const NON_CONTENT_BLOCKS =
  /<(script|style|noscript|template|svg|iframe|form|nav|aside|footer|header)\b[^>]*>[\s\S]*?<\/\1>/giu;

/** Wrappers that commonly hold the article body, best candidate first. */
const BODY_CONTAINERS = [
  /<article\b[^>]*>([\s\S]*?)<\/article>/giu,
  /<div\b[^>]*(?:class|id)\s*=\s*["'][^"']*(?:article-?(?:body|content|text)|entry-content|post-content|content-?body)[^"']*["'][^>]*>([\s\S]*?)<\/div>/giu,
  /<main\b[^>]*>([\s\S]*?)<\/main>/giu,
];

function stripNonContent(html: string): string {
  return html.replace(NON_CONTENT_BLOCKS, " ").replace(/<!--[\s\S]*?-->/gu, " ");
}

function metaContent(html: string, patterns: readonly RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = pattern.exec(html);
    if (match?.[1]) {
      const value = decodeHtml(match[1]).trim();
      if (value) return value;
    }
  }
  return null;
}

function decodeHtml(value: string): string {
  return value
    .replaceAll("&nbsp;", " ")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replace(/&#(\d+);/gu, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/giu, (_match, code: string) =>
      String.fromCodePoint(parseInt(code, 16)),
    )
    .replaceAll("&amp;", "&");
}

function metaPattern(attribute: string, name: string): RegExp {
  return new RegExp(
    `<meta\\b[^>]*${attribute}\\s*=\\s*["']${name}["'][^>]*content\\s*=\\s*["']([^"']*)["']`,
    "iu",
  );
}

function metaPatternReversed(attribute: string, name: string): RegExp {
  return new RegExp(
    `<meta\\b[^>]*content\\s*=\\s*["']([^"']*)["'][^>]*${attribute}\\s*=\\s*["']${name}["']`,
    "iu",
  );
}

function metaPair(attribute: string, name: string): RegExp[] {
  return [metaPattern(attribute, name), metaPatternReversed(attribute, name)];
}

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/** Every JSON-LD graph node in the page, flattened. */
export function extractJsonLdNodes(html: string): Array<Record<string, JsonValue>> {
  const nodes: Array<Record<string, JsonValue>> = [];
  const pattern =
    /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/giu;

  for (const match of html.matchAll(pattern)) {
    const raw = match[1]?.trim();
    if (!raw) continue;
    let parsed: JsonValue;
    try {
      parsed = JSON.parse(raw) as JsonValue;
    } catch {
      continue;
    }
    const queue: JsonValue[] = [parsed];
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current || typeof current !== "object") continue;
      if (Array.isArray(current)) {
        queue.push(...current);
        continue;
      }
      nodes.push(current as Record<string, JsonValue>);
      const graph = (current as Record<string, JsonValue>)["@graph"];
      if (Array.isArray(graph)) queue.push(...graph);
    }
  }
  return nodes;
}

function asString(value: JsonValue | undefined): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (Array.isArray(value)) {
    for (const entry of value) {
      const resolved = asString(entry);
      if (resolved) return resolved;
    }
    return null;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, JsonValue>;
    return asString(record.name) ?? asString(record.url) ?? asString(record["@id"]);
  }
  return null;
}

function isArticleNode(node: Record<string, JsonValue>): boolean {
  const type = node["@type"];
  const types = Array.isArray(type) ? type : [type];
  return types.some(
    (candidate) =>
      typeof candidate === "string" &&
      /(?:^|\b)(?:News)?Article|BlogPosting|Report$/u.test(candidate),
  );
}

function isoOrNull(value: string | null): string | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

function textFromContainers(html: string): string {
  for (const pattern of BODY_CONTAINERS) {
    pattern.lastIndex = 0;
    let best = "";
    for (const match of html.matchAll(pattern)) {
      const candidate = normalizeArticleText(match[1] ?? "");
      if (candidate.length > best.length) best = candidate;
    }
    // A real article body is longer than a teaser block.
    if (best.length >= 200) return best;
  }
  return "";
}

/** Paragraph text, as the final fallback when no container is identifiable. */
function textFromParagraphs(html: string): string {
  const paragraphs: string[] = [];
  for (const match of html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/giu)) {
    const text = normalizeArticleText(match[1] ?? "");
    // Skip nav crumbs, captions and cookie notices.
    if (text.length >= 40) paragraphs.push(text);
  }
  return paragraphs.join("\n\n");
}

export interface ParseOptions {
  readonly fallbackLanguage?: NewsSourceLanguage | null;
  readonly minimumTextLength?: number;
}

/**
 * Parses one article page into plain text plus the metadata the pipeline
 * needs. Throws `news_engine_parse_empty` when nothing usable is found, which
 * the caller records as PARSE_FAILED rather than pushing an empty item
 * downstream.
 */
export function parseArticle(html: string, url: string, options: ParseOptions = {}): ParsedArticle {
  const minimumLength = options.minimumTextLength ?? 200;
  const cleaned = stripNonContent(html);
  const nodes = extractJsonLdNodes(html);
  const articleNode = nodes.find(isArticleNode) ?? null;

  let parseSource: ParsedArticle["parseSource"] = "html";
  let title: string | null = null;
  let text = "";
  let publishedAt: string | null = null;
  let updatedAt: string | null = null;
  let authorName: string | null = null;
  let section: string | null = null;
  let declaredHeroUrl: string | null = null;
  let language: string | null = null;

  if (articleNode) {
    parseSource = "json_ld";
    title = asString(articleNode.headline) ?? asString(articleNode.name);
    publishedAt = isoOrNull(asString(articleNode.datePublished));
    updatedAt = isoOrNull(asString(articleNode.dateModified));
    authorName = asString(articleNode.author);
    section = asString(articleNode.articleSection);
    declaredHeroUrl = asString(articleNode.image);
    language = asString(articleNode.inLanguage);
    const bodyText = asString(articleNode.articleBody);
    if (bodyText) text = normalizeArticleText(bodyText);
  }

  if (!title) {
    title = metaContent(html, [
      ...metaPair("property", "og:title"),
      ...metaPair("name", "twitter:title"),
    ]);
    if (title) parseSource = parseSource === "html" ? "open_graph" : parseSource;
  }
  if (!title) {
    const titleMatch = /<title\b[^>]*>([\s\S]*?)<\/title>/iu.exec(html);
    title = titleMatch?.[1] ? decodeHtml(titleMatch[1]).trim() : null;
  }
  if (!title) {
    const h1Match = /<h1\b[^>]*>([\s\S]*?)<\/h1>/iu.exec(cleaned);
    title = h1Match?.[1] ? normalizeArticleText(h1Match[1]) : null;
  }

  publishedAt ??= isoOrNull(
    metaContent(html, [
      ...metaPair("property", "article:published_time"),
      ...metaPair("name", "publish-date"),
      ...metaPair("itemprop", "datePublished"),
    ]),
  );
  updatedAt ??= isoOrNull(
    metaContent(html, [
      ...metaPair("property", "article:modified_time"),
      ...metaPair("itemprop", "dateModified"),
    ]),
  );
  authorName ??= metaContent(html, [
    ...metaPair("name", "author"),
    ...metaPair("property", "article:author"),
  ]);
  section ??= metaContent(html, metaPair("property", "article:section"));
  declaredHeroUrl ??= metaContent(html, [
    ...metaPair("property", "og:image"),
    ...metaPair("name", "twitter:image"),
  ]);
  language ??=
    metaContent(html, metaPair("property", "og:locale")) ??
    /<html\b[^>]*\blang\s*=\s*["']([^"']+)["']/iu.exec(html)?.[1] ??
    null;

  if (text.length < minimumLength) {
    const containerText = textFromContainers(cleaned);
    if (containerText.length > text.length) {
      text = containerText;
      parseSource = "html";
    }
  }
  if (text.length < minimumLength) {
    const paragraphText = textFromParagraphs(cleaned);
    if (paragraphText.length > text.length) {
      text = paragraphText;
      parseSource = "html";
    }
  }

  // An article with a headline and a description but no body is a teaser
  // page. The description alone is not enough to extract facts from, and
  // publishing from it would be republishing someone's excerpt.
  if (text.length < minimumLength) {
    throw new NewsEngineError(
      "news_engine_parse_empty",
      `No article body of at least ${minimumLength} characters was found.`,
    );
  }

  const normalizedLanguage = language?.slice(0, 2).toLowerCase() ?? null;
  const resolvedLanguage =
    normalizedLanguage && ["ar", "fr", "en", "es"].includes(normalizedLanguage)
      ? (normalizedLanguage as NewsSourceLanguage)
      : (options.fallbackLanguage ?? null);

  let heroUrl: string | null = null;
  if (declaredHeroUrl) {
    try {
      const resolved = new URL(declaredHeroUrl, url);
      heroUrl = resolved.protocol === "https:" ? resolved.toString() : null;
    } catch {
      heroUrl = null;
    }
  }

  return {
    title: title ? title.slice(0, 500) : null,
    text,
    publishedAt,
    updatedAt,
    authorName: authorName ? authorName.slice(0, 160) : null,
    section: section ? section.slice(0, 160) : null,
    declaredHeroUrl: heroUrl,
    language: resolvedLanguage,
    parseSource,
  };
}
