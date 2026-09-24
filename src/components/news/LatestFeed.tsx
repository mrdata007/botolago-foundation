import emptyNewsArt from "@/assets/illustrations/empty-news.webp";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import type { NewsLanguage } from "@/backend/news/contracts";
import { ArticleCard } from "@/components/common/ArticleCard";
import { UiButton } from "@/components/ui-kit";
import { EmptyState, ErrorState } from "@/components/common/States";
import { SkeletonList } from "@/components/common/Skeletons";
import { useI18n } from "@/i18n/provider";
import type { Club } from "@/types/domain";
import { NewsRowSkeleton } from "./NewsSkeletons";
import { presentArticleForDisplay } from "./news-data";
import { newsFeedQuery } from "./news-feed-query";

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
  const query = useInfiniteQuery(newsFeedQuery(language, categorySlug, teamId));

  const fetched = (query.data?.pages ?? []).flatMap((page) => page.items);
  const items = fetched.filter((item) => !excludeIds?.has(item.id));

  if (query.isLoading) {
    return <SkeletonList count={4}>{() => <NewsRowSkeleton />}</SkeletonList>;
  }

  if (query.isError) {
    return <ErrorState onRetry={() => void query.refetch()} />;
  }

  // "No articles" only when there are none: when every article fetched so
  // far is already shown above (a lead, top stories, or the carousel of the
  // newest), the rail simply has nothing more to add.
  if (fetched.length === 0) {
    return <EmptyState illustration={emptyNewsArt}>{t("news.empty_category")}</EmptyState>;
  }
  if (items.length === 0 && !query.hasNextPage) return null;

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
        // The kit's soft pill, full width at the row height.
        <UiButton
          variant="soft"
          onClick={() => void query.fetchNextPage()}
          disabled={query.isFetchingNextPage}
          className="mt-1"
        >
          {query.isFetchingNextPage && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          {t("news.view_all")}
        </UiButton>
      )}
    </div>
  );
}
