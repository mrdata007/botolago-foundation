import type { Article } from "@/types/domain";

export const PUBLIC_SITE_ORIGIN = "https://botolago.com";

export function buildArticleHead(article: Article | null | undefined, articleId: string) {
  const title = article?.title.fr ?? "Actualités — BotolaGO";
  const description =
    article?.excerpt.fr ?? "Toute l'actualité premium du football marocain sur BotolaGO.";
  const canonical = `${PUBLIC_SITE_ORIGIN}/news/${encodeURIComponent(articleId)}`;

  return {
    meta: [
      { title: `${title} — BotolaGO` },
      { name: "description", content: description },
      { property: "og:type", content: "article" },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:url", content: canonical },
      ...(article?.publishedAt
        ? [{ property: "article:published_time", content: article.publishedAt }]
        : []),
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: description },
      ...(article?.heroUrl
        ? [
            { property: "og:image", content: article.heroUrl },
            { name: "twitter:image", content: article.heroUrl },
          ]
        : []),
    ],
    links: [{ rel: "canonical", href: canonical }],
  };
}
