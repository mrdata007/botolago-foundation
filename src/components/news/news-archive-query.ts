import { SupabaseNewsRepository, encodeNewsCursor } from "@/backend/news/supabase-repository";
import type { ArticleCursor, NewsLanguage } from "@/backend/news/contracts";
import { SITEMAP_NEWS_LIMIT } from "@/lib/sitemap";
import { isServerRender } from "@/lib/ssr-prefetch";
import { getNewsDataMode, getNewsRepository } from "@/services/news";
import { publicNewsContext } from "./news-data";
import {
  buildNewsArchivePlans,
  EMPTY_ARCHIVE_PLAN,
  NEWS_ARCHIVE_PAGE_SIZE,
  type NewsArchivePlans,
} from "./news-archive";

/** How long the server keeps the plans: the sitemap's own snapshot is a minute old at most. */
const PLANS_TTL_MS = 60_000;
let cachedPlans: { readonly at: number; readonly plans: Promise<NewsArchivePlans> } | null = null;

async function readPlans(): Promise<NewsArchivePlans> {
  // Only the database lists every article with its date; the mock repository
  // has no archive to page (its pages are the feed's, from the first).
  if (getNewsDataMode() !== "supabase") {
    return { fr: EMPTY_ARCHIVE_PLAN, ar: EMPTY_ARCHIVE_PLAN };
  }
  return buildNewsArchivePlans(
    await new SupabaseNewsRepository().getSitemapEntries(SITEMAP_NEWS_LIMIT),
  );
}

/**
 * Where every archive page starts. It reads the whole sitemap snapshot (tens
 * of thousands of small rows) and keeps one cursor in fifty, so the server
 * shares one read between renders for a minute: a crawler walking the archive
 * would otherwise read it again for every page. A failed read is not kept.
 */
async function archivePlans(): Promise<NewsArchivePlans> {
  if (!isServerRender()) return readPlans();
  const now = Date.now();
  if (cachedPlans && now - cachedPlans.at < PLANS_TTL_MS) return cachedPlans.plans;
  const plans = readPlans();
  const entry = { at: now, plans };
  cachedPlans = entry;
  plans.catch(() => {
    if (cachedPlans === entry) cachedPlans = null;
  });
  return plans;
}

export function newsArchivePlansQuery() {
  return {
    queryKey: ["news", "archive-plans-v1"] as const,
    queryFn: archivePlans,
    staleTime: 5 * 60_000,
  };
}

/** One archive page: the 50 articles from `cursor`, in the feed's order. */
export function newsArchivePageQuery(
  language: NewsLanguage,
  page: number,
  cursor: ArticleCursor | null,
) {
  return {
    queryKey: ["news", "archive-page-v1", language, page, cursor?.id ?? null] as const,
    queryFn: () =>
      getNewsRepository().getFeed(
        {
          language,
          limit: NEWS_ARCHIVE_PAGE_SIZE,
          cursor: encodeNewsCursor(cursor),
        },
        publicNewsContext(),
      ),
    staleTime: 60_000,
  };
}
