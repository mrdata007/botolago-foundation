import { SupabaseNewsRepository } from "@/backend/news/supabase-repository";
import { NEWS_ENABLED } from "@/lib/feature-flags";
import { SITEMAP_CACHE_CONTROL, SITEMAP_NEWS_LIMIT, type SitemapNewsEntry } from "@/lib/sitemap";
import { getNewsDataMode } from "@/services/news";

/**
 * What the sitemap routes share: the News read and the two answers.
 *
 * News articles are read only while `NEWS_ENABLED` is on and only from
 * `api.news_sitemap_entries`, which lists nothing that was not public when it
 * was last computed. Freshness: the database serves the entries from a
 * snapshot that pg_cron recomputes every minute, and computes them live once
 * the snapshot is more than two minutes old (migration 20260926003050). A
 * shared cache may then keep a response for the remaining three minutes and a
 * browser for one (`SITEMAP_CACHE_CONTROL`), so an unpublished article leaves
 * the sitemap within five minutes and a new one appears within five.
 *
 * A failed read answers 503 with Retry-After, never cached (audit 2026-09-24,
 * P1-13): a 200 without the articles told a crawler 15,700 articles had gone,
 * where a 503 makes it keep the last good copy and come back.
 */
export async function readSitemapNews(): Promise<readonly SitemapNewsEntry[] | "failed"> {
  if (!NEWS_ENABLED || getNewsDataMode() !== "supabase") return [];
  try {
    return await new SupabaseNewsRepository().getSitemapEntries(SITEMAP_NEWS_LIMIT);
  } catch {
    return "failed";
  }
}

export function sitemapUnavailable(): Response {
  return new Response("Sitemap temporarily unavailable", {
    status: 503,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "retry-after": "300",
      "cache-control": "no-store",
    },
  });
}

export function sitemapXmlResponse(xml: string): Response {
  return new Response(xml, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": SITEMAP_CACHE_CONTROL,
    },
  });
}
