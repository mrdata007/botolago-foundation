import type { ArticleDetailDto } from "@/backend/news/contracts";
import { bodyParagraphs, comparableText, ellipsisStem } from "@/lib/article-text";
import { resolveMediaUrl } from "@/lib/media";
import { PUBLIC_SITE_ORIGIN } from "@/lib/site-origin";
import { breadcrumbJsonLd } from "@/lib/structured-data";

// Kept exported from here: most pages import the origin with the article
// helpers. It lives in its own module so structured-data.ts, which this file
// uses, can read it without an import cycle.
export { PUBLIC_SITE_ORIGIN };

export function buildCanonicalArticleUrl(articleId: string): string {
  return `${PUBLIC_SITE_ORIGIN}/news/${encodeURIComponent(articleId)}`;
}

/**
 * When an article was last really modified, or `null` when it has not been
 * since it was published (a change within a minute of publishing is the
 * publishing itself). Read from `contentUpdatedAt`, never `updatedAt`: a bulk
 * update on 2026-09-24 moved `updatedAt` on 15,690 articles without changing
 * a word, and every one of them then claimed an edit that morning (audit
 * P1-4). Without `contentUpdatedAt` (an API build before migration
 * 20260924200600) nothing is claimed.
 */
export function articleModifiedAt(
  article: Pick<ArticleDetailDto, "publishedAt"> & { contentUpdatedAt?: string | null },
): string | null {
  const modified = article.contentUpdatedAt;
  if (!modified) return null;
  const gap = Date.parse(modified) - Date.parse(article.publishedAt);
  return Number.isFinite(gap) && gap > 60_000 ? modified : null;
}

/**
 * A stored SEO value, unless it is only its source text cut short.
 *
 * The licensed-archive import filled `seo_title` with the headline clipped at
 * a word before 60 characters plus "…", and `seo_description` with the text
 * clipped before 155: on 2026-09-25, 13,236 of the 15,690 published editions
 * carried a clipped title and every one a clipped description. Used as they
 * are, they put "Officiel : Le Wydad AC annonce la signature de l'attaquant…"
 * in the title tag and the NewsArticle headline, which loses the player the
 * story is about. Search engines and social cards shorten a long title to
 * fit their own space; a copy pre-cut to 60 characters only loses words.
 *
 * So a value that ends in an ellipsis and whose text before it opens `full`
 * gives way to `full`. Anything else is an editor's own choice and is kept:
 * a different wording, or a clip of some other text than `full`. (A
 * description clipped from the body is completed from it first; see
 * `articleDescription`.)
 */
export function unclippedSeoText(
  stored: string | null | undefined,
  full: string | null | undefined,
): string | null {
  const value = stored?.trim();
  if (!value) return full?.trim() || null;
  const whole = full?.replace(/\s+/g, " ").trim();
  const stem = /^(.*?)\s*(?:…|\.\.\.)$/.exec(value.replace(/\s+/g, " "))?.[1];
  if (whole && stem && whole.length > stem.length && whole.startsWith(stem)) return whole;
  return value;
}

/** The headline an edition is presented under in metadata: never a clipped copy. */
export function articleHeadline(article: Pick<ArticleDetailDto, "seo" | "title">): string {
  return unclippedSeoText(article.seo.title, article.title) ?? article.title;
}

/**
 * How much of a description a search result shows, and the length the
 * licensed import cut `seo_description` to (its `SEO_DESCRIPTION_LIMIT`; a
 * test holds the two together).
 */
export const SEARCH_DESCRIPTION_LENGTH = 155;

/**
 * The body's text from the start to the end of the paragraph `stem` stops
 * in, when the body opens with `stem` (comparable text) and runs on past it;
 * else `null`.
 */
function runToParagraphEnd(stem: string, paragraphs: readonly string[]): string | null {
  let opening = "";
  for (let index = 0; index < paragraphs.length; index += 1) {
    const paragraph = comparableText(paragraphs[index]);
    opening = index ? `${opening} ${paragraph}` : paragraph;
    if (opening.length < stem.length) continue;
    // A body that ends exactly where the stem does had nothing cut from it.
    const cut = opening.length > stem.length || index < paragraphs.length - 1;
    return opening.startsWith(stem) && cut ? paragraphs.slice(0, index + 1).join(" ") : null;
  }
  return null;
}

/**
 * `clipped` completed from the body, when it is the body's opening text cut
 * short and closed with an ellipsis: the body's text from the start to the
 * end of the paragraph the cut fell in. `null` when it is not such a cut.
 *
 * The import clipped the paragraphs joined end to end, so its cut runs on
 * past a short first paragraph; completing to the end of the paragraph keeps
 * every word the clip had, and ends where the writer ended a thought. A body
 * that ends exactly where the text before the ellipsis does had nothing cut
 * from it: that ellipsis is the writer's own.
 */
function completedFromBody(clipped: string, paragraphs: readonly string[]): string | null {
  const stem = ellipsisStem(comparableText(clipped));
  return stem ? runToParagraphEnd(stem, paragraphs) : null;
}

/**
 * The body's opening as the archive's copy of it reads once completed: the
 * body's text to the end of the paragraph the licensed import's cut falls
 * in, or the whole text when it fits the search length. That cut (`clip` in
 * scripts/backend/elbotola-licensed-import.ts) kept the paragraphs joined end
 * to end up to the last space before character 154, the 155th going to the
 * "…". `completedFromBody` runs the stored copy on from there and this runs
 * on from the same place, so both give the same text. `null` in the rare
 * case where the text does not compare as it reads (literal markup in it).
 */
function openingToImportCut(paragraphs: readonly string[]): string | null {
  const text = paragraphs.join(" ");
  if (text.length <= SEARCH_DESCRIPTION_LENGTH) return text;
  const cut = text.slice(0, SEARCH_DESCRIPTION_LENGTH - 1);
  const stem = comparableText(cut.slice(0, Math.max(cut.lastIndexOf(" "), 1)));
  return stem ? runToParagraphEnd(stem, paragraphs) : null;
}

/**
 * The edition's description in metadata, or `null` when it has none: whole
 * text, like the headline, never the import's clipped copy.
 *
 * `seo_description` was imported as the body's paragraphs joined end to end
 * and cut before 155 characters with "…", on all 15,690 published editions
 * (2026-09-25). Where the first paragraph is longer than the cut (9,065
 * editions), completing it gives that paragraph, which is also the summary.
 * Where it is shorter (6,625), the cut ran on into the next one on 5,876 of
 * them: those first paragraphs are often a kicker ("Mise à jour.", "Les
 * retardataires."), too thin to describe the story alone, so the description
 * runs to the end of the paragraph the cut fell in and keeps every word the
 * clip had. On the 396 whose first paragraph is over 300 characters the
 * summary is itself cut with "…", and the description is that whole
 * paragraph. Nine in ten come out under about 370 characters, and none over
 * about 810; search engines and social cards shorten it to their own space,
 * as they do a long headline.
 *
 * The import now stores no description where the text is longer than the
 * search length, and its summary is the first paragraph whole (up to 300
 * characters), so those 5,876 would be described by their short first
 * paragraph alone. With no description stored, a summary that is the body's
 * first paragraph uncut therefore runs on to the end of the paragraph the
 * import's cut would have fallen in, or to the end of a text that fits the
 * search length (`openingToImportCut`): an edition imported now is described
 * as its archived copy is. BotolaGO's own editions follow the same rule, on
 * purpose: one with no SEO description whose summary repeats a short first
 * paragraph is described by that paragraph and the text after it, a fuller
 * description than the paragraph alone. None was public on 2026-09-25.
 *
 * An editor's own description stands, and so does a summary written apart
 * from the body. A description clipped from such a summary gives way to it.
 */
export function articleDescription(
  article: Pick<ArticleDetailDto, "seo" | "summary" | "bodyHtml">,
): string | null {
  const paragraphs = bodyParagraphs(article.bodyHtml);
  const stored = article.seo.description?.trim();
  if (stored) {
    return completedFromBody(stored, paragraphs) ?? unclippedSeoText(stored, article.summary);
  }
  const summary = article.summary.trim();
  if (!summary) return null;
  if (paragraphs.length > 0 && comparableText(summary) === comparableText(paragraphs[0])) {
    return openingToImportCut(paragraphs) ?? summary;
  }
  return completedFromBody(summary, paragraphs) ?? summary;
}

/**
 * The breadcrumb's first two steps, in the language of the edition the page
 * shows: an Arabic article's trail used to read "Accueil › Actualités" above
 * an Arabic headline. The same words as the navigation's `nav.home` and
 * `nav.news` (a test holds them to it); spelled out here because `head()`
 * runs without the reader's dictionary, and the Arabic one is not in the
 * page bundle.
 */
export const ARTICLE_BREADCRUMB_LABELS = {
  fr: { home: "Accueil", news: "Actualités" },
  ar: { home: "الرئيسية", news: "الأخبار" },
} as const satisfies Record<ArticleDetailDto["language"], { home: string; news: string }>;

/**
 * NewsArticle structured data (schema.org), built only from fields the DTO
 * actually carries — no fabricated author/publisher/image. Returns `null`
 * when there isn't enough real data for a meaningful schema block.
 *
 * `image` is the article's own hero, and nothing else. An edition without one
 * shows a stock photograph for its topic on the page (`ArticleHeroFallback`),
 * the same picture on hundreds of stories; Google's Article guidance asks for
 * an image that represents the marked-up article, so that one is not claimed
 * as this article's image.
 */
export function buildArticleJsonLd(
  article: ArticleDetailDto,
  canonicalUrl: string,
): Record<string, unknown> | null {
  const headline = articleHeadline(article);
  if (!headline) return null;

  const heroUrl = resolveMediaUrl(article.hero);
  const authorName = article.author?.name ?? article.publisher?.name;
  const dateModified = articleModifiedAt(article) ?? article.publishedAt;

  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline,
    datePublished: article.publishedAt,
    dateModified,
    mainEntityOfPage: { "@type": "WebPage", "@id": canonicalUrl },
    inLanguage: article.language,
  };

  const description = articleDescription(article);
  if (description) jsonLd.description = description;
  if (heroUrl) jsonLd.image = [heroUrl];
  if (authorName) jsonLd.author = { "@type": "Person", name: authorName };
  // "BotolaGO" is the product's own real publisher identity, not fabricated data.
  jsonLd.publisher = { "@type": "Organization", name: article.publisher?.name ?? "BotolaGO" };
  // Licensed content: say what it is a copy of.
  if (article.source?.url) jsonLd.isBasedOn = article.source.url;

  return jsonLd;
}

/**
 * Serializes JSON-LD for embedding inside a `<script>` element.
 *
 * The router writes a head script's children with `dangerouslySetInnerHTML`,
 * so nothing between the tags is escaped. Every string in this block --
 * headline, description, author name -- is editor-supplied, and a `</script>`
 * inside any of them would close the element early and leave the rest of the
 * value being parsed as markup in the document head.
 *
 * Escaping `<`, `>` and `&` as \u-sequences closes that off. JSON parsers read
 * them back as the original characters, so a consumer (or a crawler) sees the
 * text exactly as written; only the bytes on the wire change.
 */
export function serializeJsonLd(jsonLd: Record<string, unknown>): string {
  return JSON.stringify(jsonLd)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

/**
 * Route `head()` metadata for an article edition. Reads whichever
 * language edition actually loaded (`article.language`) instead of
 * assuming French, so an Arabic edition's real title/summary populate the
 * title tag, description and OpenGraph/Twitter tags instead of silently
 * falling back to French copy. The same goes for the breadcrumb, whose steps
 * are named in the edition's language, and the headline and description are
 * the whole text, never the import's clipped SEO copies (`unclippedSeoText`).
 * All of it depends on the edition alone, never on the reader's language, so
 * the server render and the browser's agree.
 */
export function buildArticleHead(
  article: ArticleDetailDto | null | undefined,
  articleId: string,
  { unavailable = false }: { unavailable?: boolean } = {},
) {
  const title = article ? articleHeadline(article) : "Actualités";
  const description =
    (article && articleDescription(article)) ??
    "Toute l'actualité premium du football marocain sur BotolaGO.";
  // One canonical per edition, whichever URL it was reached by. The page is
  // routable by slug and by edition id, and the canonical used to echo the
  // address bar, so the same article declared two different canonical URLs;
  // the share button in the page body already used `article.id`.
  const canonical = buildCanonicalArticleUrl(article?.id ?? articleId);
  // hreflang: only when a counterpart is public (the API lists nothing else),
  // and then self + every counterpart, each at its own canonical URL. French
  // is the site's default language, so the French edition is x-default.
  const editions = article?.translations?.length
    ? [{ id: article.id, language: article.language }, ...article.translations]
    : [];
  const alternates: { rel: string; hrefLang: string; href: string }[] = editions.map((edition) => ({
    rel: "alternate",
    hrefLang: edition.language,
    href: buildCanonicalArticleUrl(edition.id),
  }));
  const french = editions.find((edition) => edition.language === "fr");
  if (french) {
    alternates.push({
      rel: "alternate",
      hrefLang: "x-default",
      href: buildCanonicalArticleUrl(french.id),
    });
  }
  const heroUrl = article ? resolveMediaUrl(article.hero) : undefined;
  const hero = heroUrl ? article?.hero : null;
  const jsonLd = article ? buildArticleJsonLd(article, canonical) : null;
  const trail = article ? ARTICLE_BREADCRUMB_LABELS[article.language] : null;

  return {
    meta: [
      { title: `${title} — BotolaGO` },
      // Nothing to show: an unknown, unpublished or withdrawn article answers
      // 404 and stays out of the index. A read that failed (`unavailable`)
      // answers 503 and must NOT say noindex: the article exists, and a
      // search engine would drop it (audit 2026-09-24, P1-3).
      ...(article || unavailable ? [] : [{ name: "robots", content: "noindex" }]),
      // Licensed content from another publisher is indexed like BotolaGO's
      // own (owner decision, 2026-09-24); it still credits its source on the
      // page and in JSON-LD `isBasedOn`.
      { name: "description", content: description },
      { property: "og:type", content: "article" },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:url", content: canonical },
      ...(article?.language
        ? [{ property: "og:locale", content: article.language === "ar" ? "ar_MA" : "fr_FR" }]
        : []),
      ...(article?.translations ?? []).map((translation) => ({
        property: "og:locale:alternate",
        content: translation.language === "ar" ? "ar_MA" : "fr_FR",
      })),
      ...(article?.publishedAt
        ? [{ property: "article:published_time", content: article.publishedAt }]
        : []),
      ...(article && articleModifiedAt(article)
        ? [{ property: "article:modified_time", content: articleModifiedAt(article)! }]
        : []),
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: description },
      // Without a hero the root's share picture stands, with its own size and
      // alt. With one, its alt replaces the root's "BotolaGO", and its size
      // the root's 1200×630 when the media record has one. When it has none,
      // the root's size tags stay: the router merges heads tag by tag, and a
      // page can replace a parent's tag but not drop it. They come out before
      // the hero's og:image, so under the Open Graph protocol they size
      // nothing, but a lenient reader may apply them to the hero. No
      // published edition has a hero yet; closing this needs a size on every
      // hero, or no size declared by the root.
      ...(heroUrl && hero
        ? [
            { property: "og:image", content: heroUrl },
            { property: "og:image:alt", content: hero.alt?.trim() || title },
            ...(hero.width && hero.height
              ? [
                  { property: "og:image:width", content: String(hero.width) },
                  { property: "og:image:height", content: String(hero.height) },
                ]
              : []),
            { name: "twitter:image", content: heroUrl },
          ]
        : []),
    ],
    links: [{ rel: "canonical", href: canonical }, ...alternates],
    // A head script is declared flat: every key other than `children` becomes an
    // attribute, and the router supplies the `script` tag itself. Wrapping it as
    // {tag, attrs, children} -- which reads like the shape the router renders --
    // instead emitted `<script tag="script" attrs="[object Object]">`. The type
    // was lost with it, so browsers ran the JSON as JavaScript and threw on
    // every article, and no crawler ever saw the structured data.
    ...(jsonLd && article && trail
      ? {
          scripts: [
            { type: "application/ld+json", children: serializeJsonLd(jsonLd) },
            {
              type: "application/ld+json",
              children: serializeJsonLd(
                breadcrumbJsonLd([
                  { name: trail.home, path: "/" },
                  { name: trail.news, path: "/news" },
                  { name: title, path: `/news/${encodeURIComponent(article.id)}` },
                ]),
              ),
            },
          ],
        }
      : {}),
  };
}
