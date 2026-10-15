import emptyNewsArt from "@/assets/illustrations/empty-news.webp";
import { Loader2 } from "lucide-react";
import { ArticleCard } from "@/components/common/ArticleCard";
import { SkeletonList } from "@/components/common/Skeletons";
import { UiButton, UiCard, UiEmptyState, UiErrorState, UiLinkButton } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { savedEntryId, type SavedEntry } from "@/lib/saved-collection";
import { cn } from "@/lib/utils";
import { ui } from "@/components/ui-kit";
import { NewsRowSkeleton } from "./NewsSkeletons";
import { gradientTokenForId } from "./news-data";

export type SavedArticlesPhase = "loading" | "signin" | "error" | "ready";

/**
 * The saved-articles collection, drawn from what `useSavedCollection` hands it.
 * Presentation only, so the states render the same in a test as on the page:
 *
 *   loading  row skeletons, where the cards will be
 *   signin   a reader with no account has no list (it lives on the account)
 *   error    the read FAILED: a message and a retry, never an empty list
 *   ready    the rows; or the empty state when there are none
 *
 * A story that can no longer be opened keeps a row of its own with one action,
 * "remove", rather than vanishing or breaking the list.
 */
export function SavedArticlesView({
  phase,
  entries,
  hasMore,
  loadingMore,
  moreFailed,
  onRetry,
  onLoadMore,
  onRemove,
}: {
  phase: SavedArticlesPhase;
  entries: readonly SavedEntry[];
  hasMore: boolean;
  loadingMore: boolean;
  /** The next page failed; the rows already loaded stay. */
  moreFailed: boolean;
  onRetry: () => void;
  onLoadMore: () => void;
  onRemove: (id: string) => void;
}) {
  const { t } = useI18n();

  if (phase === "loading") {
    return (
      <div role="status" aria-busy="true">
        <span className="sr-only">{t("state.loading")}</span>
        <SkeletonList count={4}>{() => <NewsRowSkeleton />}</SkeletonList>
      </div>
    );
  }

  if (phase === "signin") {
    return (
      <UiEmptyState
        title={t("news.saved.signin_title")}
        body={t("news.saved.signin_body")}
        action={
          <div className="mt-4 grid gap-2.5">
            <UiLinkButton to="/auth/login" search={{ next: "/profile/saved" }}>
              {t("auth.prompt.login")}
            </UiLinkButton>
            <UiLinkButton to="/auth/register" variant="soft">
              {t("auth.prompt.register")}
            </UiLinkButton>
          </div>
        }
      />
    );
  }

  if (phase === "error") {
    return <UiErrorState body={t("news.saved.error")} onRetry={onRetry} />;
  }

  if (entries.length === 0 && !hasMore) {
    return (
      <UiEmptyState
        illustration={emptyNewsArt}
        title={t("news.saved.empty_title")}
        body={t("news.saved.empty")}
        action={
          <UiLinkButton to="/news" size="sm" variant="ink" className="mt-4">
            {t("news.saved.browse")}
          </UiLinkButton>
        }
      />
    );
  }

  return (
    <div className="grid gap-2.5">
      <ul className="grid gap-2.5" aria-label={t("news.section.saved")}>
        {entries.map((entry) => (
          <li key={savedEntryId(entry)} className="min-w-0">
            {entry.kind === "article" ? (
              <ArticleCard
                article={{ ...entry.article, heroGradient: gradientTokenForId(entry.article.id) }}
                variant="horizontal"
              />
            ) : (
              <UnavailableRow id={entry.id} onRemove={onRemove} />
            )}
          </li>
        ))}
      </ul>
      {moreFailed && (
        <p role="alert" className={cn("text-center", ui.text.secondary, ui.tone.negative)}>
          {t("news.saved.more_error")}
        </p>
      )}
      {hasMore && (
        <UiButton variant="soft" onClick={onLoadMore} disabled={loadingMore} className="mt-1">
          {loadingMore && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          {moreFailed ? t("state.retry") : t("news.saved.more")}
        </UiButton>
      )}
    </div>
  );
}

function UnavailableRow({ id, onRemove }: { id: string; onRemove: (id: string) => void }) {
  const { t } = useI18n();
  return (
    <UiCard
      padding="md"
      testId="saved-unavailable"
      className="flex flex-wrap items-center justify-between gap-3"
    >
      <p className={cn("min-w-0 flex-1", ui.text.body, ui.tone.muted)}>
        {t("news.saved.unavailable")}
      </p>
      <UiButton variant="soft" size="sm" onClick={() => onRemove(id)}>
        {t("news.saved.remove")}
      </UiButton>
    </UiCard>
  );
}
