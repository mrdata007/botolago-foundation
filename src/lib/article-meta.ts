import type { ArticleDetailDto } from "@/backend/news/contracts";
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
 * 20260924190600) nothing is claimed.
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
 * NewsArticle structured data (schema.org), built only from fields the DTO
 * actually carries — no fabricated author/publisher/image. Returns `null`
 * when there isn't enough real data for a meaningful schema block.
 */
export function buildArticleJsonLd(
  article: ArticleDetailDto,
  canonicalUrl: string,
): Record<string, unknown> | null {
  const headline = article.seo.title ?? article.title;
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

  if (article.seo.description ?? article.summary) {
    jsonLd.description = article.seo.description ?? article.summary;
  }
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
 * falling back to French copy.
 */
export function buildArticleHead(
  article: ArticleDetailDto | null | undefined,
  articleId: string,
  { unavailable = false }: { unavailable?: boolean } = {},
) {
  const title = article?.seo.title ?? article?.title ?? "Actualités";
  const description =
    article?.seo.description ??
    article?.summary ??
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
  const jsonLd = article ? buildArticleJsonLd(article, canonical) : null;

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
      ...(heroUrl
        ? [
            { property: "og:image", content: heroUrl },
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
    ...(jsonLd && article
      ? {
          scripts: [
            { type: "application/ld+json", children: serializeJsonLd(jsonLd) },
            {
              type: "application/ld+json",
              children: serializeJsonLd(
                breadcrumbJsonLd([
                  { name: "Accueil", path: "/" },
                  { name: "Actualités", path: "/news" },
                  { name: title, path: `/news/${encodeURIComponent(article.id)}` },
                ]),
              ),
            },
          ],
        }
      : {}),
  };
}
