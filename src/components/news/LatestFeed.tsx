import { useInfiniteQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { getNewsRepository } from "@/services/news";
import { encodeNewsCursor } from "@/backend/news/supabase-repository";
import type { NewsLanguage } from "@/backend/news/contracts";
import { ArticleCard } from "@/components/common/ArticleCard";
import { ui } from "@/components/ui-kit";
import { EmptyState, ErrorState } from "@/components/common/States";
import { ArticleCardSkeleton, SkeletonList } from "@/components/common/Skeletons";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import type { Club } from "@/types/domain";
import { presentArticleForDisplay, publicNewsContext } from "./news-data";

const PAGE_SIZE = 10;

/**
 * Chronological "Latest" feed with real keyset pagination: each "load more"
 * fetches the next page via `nextCursor` and appends it, and the control is
 * hidden once the API reports no further pages — no page-number guessing.
 */
export function LatestFeed({
  language,
  categorySlug,
  teamId,
  clubs,
  excludeIds,
}: {
  language: NewsLanguage;
  categorySlug: string | null;
  teamId: string | null;
  clubs: readonly Club[];
  /** Ids already shown in the lead/featured modules above this rail. */
  excludeIds?: ReadonlySet<string>;
}) {
  const { t } = useI18n();
  const query = useInfiniteQuery({
    queryKey: ["news", "feed-v2", language, categorySlug, teamId],
    queryFn: ({ pageParam }: { pageParam: string | null }) =>
      getNewsRepository().getFeed(
        {
          language,
          limit: PAGE_SIZE,
          cursor: pageParam,
          categorySlug,
          teamId,
        },
        publicNewsContext(),
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => encodeNewsCursor(lastPage.nextCursor),
  });

  const items = (query.data?.pages ?? [])
    .flatMap((page) => page.items)
    .filter((item) => !excludeIds?.has(item.id));

  if (query.isLoading) {
    return <SkeletonList count={4}>{() => <ArticleCardSkeleton />}</SkeletonList>;
  }

  if (query.isError) {
    return <ErrorState onRetry={() => void query.refetch()} />;
  }

  if (items.length === 0) {
    return <EmptyState>{t("news.empty_category")}</EmptyState>;
  }

  return (
    <div className="grid gap-2.5">
      {items.map((dto) => (
        <ArticleCard
          key={dto.id}
          article={presentArticleForDisplay(dto)}
          variant="horizontal"
          clubs={clubs}
        />
      ))}
      {query.hasNextPage && (
        <button
          type="button"
          onClick={() => void query.fetchNextPage()}
          disabled={query.isFetchingNextPage}
          className={cn(
            // Kit vocabulary: the sunken surface, the kit radius, the kit
            // focus ring and the kit type scale replace the V2 glass pill.
            "mt-1 inline-flex items-center justify-center gap-2 px-4",
            ui.space.tap,
            ui.radius.full,
            ui.surface.sunken,
            ui.text.bodyStrong,
            ui.focus,
            "transition-colors hover:opacity-90 disabled:opacity-60",
          )}
        >
          {query.isFetchingNextPage && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          {t("news.view_all")}
        </button>
      )}
    </div>
  );
}
