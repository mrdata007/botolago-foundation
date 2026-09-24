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
 *
 * Every public article is requested (up to the protocol's 50,000 URLs per
 * sitemap); the licensed ElBotola archive alone is ~15,700 editions.
 */
const SITEMAP_NEWS_LIMIT = 50_000;

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        let news: readonly SitemapNewsEntry[] = [];
        if (NEWS_ENABLED && getNewsDataMode() === "supabase") {
          try {
            news = await new SupabaseNewsRepository().getSitemapEntries(SITEMAP_NEWS_LIMIT);
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
