import { createFileRoute } from "@tanstack/react-router";
import { SupabaseNewsRepository } from "@/backend/news/supabase-repository";
import { NEWS_ENABLED } from "@/lib/feature-flags";
import { buildSitemapXml, type SitemapNewsEntry } from "@/lib/sitemap";
import { getNewsDataMode } from "@/services/news";

/**
 * /sitemap.xml. News articles are listed only while `NEWS_ENABLED` is on and
 * only from `api.news_sitemap_entries`, which returns nothing that is not
 * public right now. Cached for five minutes, so an unpublished article leaves
 * the sitemap within that window. A News read failure still serves the static
 * pages rather than failing the whole sitemap.
 */
export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        let news: readonly SitemapNewsEntry[] = [];
        if (NEWS_ENABLED && getNewsDataMode() === "supabase") {
          try {
            news = await new SupabaseNewsRepository().getSitemapEntries();
          } catch {
            news = [];
          }
        }
        return new Response(buildSitemapXml({ newsEnabled: NEWS_ENABLED, news }), {
          headers: {
            "content-type": "application/xml; charset=utf-8",
            "cache-control": "public, max-age=300",
          },
        });
      },
    },
  },
});
