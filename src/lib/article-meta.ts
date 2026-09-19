import type { ArticleDetailDto } from "@/backend/news/contracts";
import { resolveMediaUrl } from "@/lib/media";

export const PUBLIC_SITE_ORIGIN = "https://botolago.com";

export function buildCanonicalArticleUrl(articleId: string): string {
  return `${PUBLIC_SITE_ORIGIN}/news/${encodeURIComponent(articleId)}`;
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
  const dateModified =
    article.updatedAt && article.updatedAt !== article.publishedAt
      ? article.updatedAt
      : article.publishedAt;

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

  return jsonLd;
}

/**
 * Route `head()` metadata for an article edition. Reads whichever
 * language edition actually loaded (`article.language`) instead of
 * assuming French, so an Arabic edition's real title/summary populate the
 * title tag, description and OpenGraph/Twitter tags instead of silently
 * falling back to French copy.
 */
export function buildArticleHead(article: ArticleDetailDto | null | undefined, articleId: string) {
  const title = article?.seo.title ?? article?.title ?? "Actualités — BotolaGO";
  const description =
    article?.seo.description ??
    article?.summary ??
    "Toute l'actualité premium du football marocain sur BotolaGO.";
  const canonical = buildCanonicalArticleUrl(articleId);
  const heroUrl = article ? resolveMediaUrl(article.hero) : undefined;
  const jsonLd = article ? buildArticleJsonLd(article, canonical) : null;

  return {
    meta: [
      { title: `${title} — BotolaGO` },
      { name: "description", content: description },
      { property: "og:type", content: "article" },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:url", content: canonical },
      ...(article?.language
        ? [{ property: "og:locale", content: article.language === "ar" ? "ar_MA" : "fr_FR" }]
        : []),
      ...(article?.publishedAt
        ? [{ property: "article:published_time", content: article.publishedAt }]
        : []),
      ...(article?.updatedAt && article.updatedAt !== article.publishedAt
        ? [{ property: "article:modified_time", content: article.updatedAt }]
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
    links: [{ rel: "canonical", href: canonical }],
    ...(jsonLd
      ? {
          scripts: [
            {
              tag: "script" as const,
              attrs: { type: "application/ld+json" },
              children: JSON.stringify(jsonLd),
            },
          ],
        }
      : {}),
  };
}
