import { createFileRoute } from "@tanstack/react-router";
import { NEWS_ENABLED } from "@/lib/feature-flags";
import { buildSitemapIndexXml } from "@/lib/sitemap";
import { readSitemapNews, sitemapUnavailable, sitemapXmlResponse } from "@/lib/sitemap-responses";

/**
 * /sitemap.xml: a sitemap index (`buildSitemapIndexXml`) pointing at the
 * static pages, the clubs, the matches and one file per month of News
 * (`/sitemaps/<name>.xml`, `src/routes/sitemaps.$file.ts`).
 *
 * The months are those that have a public article, so the index reads the
 * News entries too; a failed read is a 503 the crawler retries, as before
 * (`@/lib/sitemap-responses`).
 */
export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const news = await readSitemapNews();
        if (news === "failed") return sitemapUnavailable();
        return sitemapXmlResponse(buildSitemapIndexXml({ newsEnabled: NEWS_ENABLED, news }));
      },
    },
  },
});
