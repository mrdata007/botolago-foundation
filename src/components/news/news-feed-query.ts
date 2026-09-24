import { getNewsRepository } from "@/services/news";
import { encodeNewsCursor } from "@/backend/news/supabase-repository";
import type { NewsLanguage } from "@/backend/news/contracts";
import { publicNewsContext } from "./news-data";

export const NEWS_FEED_PAGE_SIZE = 10;

type NewsRepositoryFeed = ReturnType<typeof getNewsRepository>["getFeed"];

/**
 * The "Latest" feed's query, shared by the feed (`LatestFeed`) and the /news
 * loader that puts its first page in the server's HTML
 * (`@/lib/ssr-prefetch`), so both use the same key.
 */
export function newsFeedQuery(
  language: NewsLanguage,
  categorySlug: string | null,
  teamId: string | null,
) {
  return {
    queryKey: ["news", "feed-v2", language, categorySlug, teamId] as const,
    queryFn: ({ pageParam }: { pageParam: string | null }) =>
      getNewsRepository().getFeed(
        {
          language,
          limit: NEWS_FEED_PAGE_SIZE,
          cursor: pageParam,
          categorySlug,
          teamId,
        },
        publicNewsContext(),
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage: Awaited<ReturnType<NewsRepositoryFeed>>) =>
      encodeNewsCursor(lastPage.nextCursor),
  };
}
