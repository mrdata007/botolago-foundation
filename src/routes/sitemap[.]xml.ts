import { createFileRoute } from "@tanstack/react-router";
import { SupabaseNewsRepository } from "@/backend/news/supabase-repository";
import { NEWS_ENABLED } from "@/lib/feature-flags";
import {
  buildSitemapXml,
  SITEMAP_CACHE_CONTROL,
  SITEMAP_NEWS_LIMIT,
  type SitemapNewsEntry,
} from "@/lib/sitemap";
import { getNewsDataMode } from "@/services/news";

/**
 * /sitemap.xml. News articles are listed only while `NEWS_ENABLED` is on and
 * only from `api.news_sitemap_entries`, which lists nothing that was not
 * public when it was last computed.
 *
 * Freshness. The database serves the entries from a snapshot that pg_cron
 * recomputes every minute, and computes them live instead once the snapshot is
 * more than two minutes old (migration 20260925180050; computing the whole
 * archive on every request is what timed out, audit 2026-09-25 A01). A shared
 * cache may then keep this response for the remaining three minutes and a
 * browser for one (`SITEMAP_CACHE_CONTROL`), so an unpublished article leaves
 * the sitemap within five minutes and a new one appears within five, also
 * while the refresh job is paused.
 *
 * A News read failure answers 503 with Retry-After, never cached. It used to
 * serve the nine static pages alone, with 200 (audit 2026-09-24, P1-13): a
 * crawler reading that sitemap during a slow minute was told 15,700 articles
 * had gone. A 503 makes it keep the last good copy and come back, and a shared
 * cache that honours `stale-if-error` serves its last good copy instead.
 *
 * Every public article that fits in one sitemap is requested
 * (`SITEMAP_NEWS_LIMIT`); the licensed ElBotola archive alone is ~15,700
 * editions.
 */
export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        let news: readonly SitemapNewsEntry[] = [];
        if (NEWS_ENABLED && getNewsDataMode() === "supabase") {
          try {
            news = await new SupabaseNewsRepository().getSitemapEntries(SITEMAP_NEWS_LIMIT);
          } catch {
            return new Response("Sitemap temporarily unavailable", {
              status: 503,
              headers: {
                "content-type": "text/plain; charset=utf-8",
                "retry-after": "300",
                "cache-control": "no-store",
              },
            });
          }
        }
        return new Response(buildSitemapXml({ newsEnabled: NEWS_ENABLED, news }), {
          headers: {
            "content-type": "application/xml; charset=utf-8",
            "cache-control": SITEMAP_CACHE_CONTROL,
          },
        });
      },
    },
  },
});
