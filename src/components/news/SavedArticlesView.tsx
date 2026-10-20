import emptyNewsArt from "@/assets/illustrations/empty-news.webp";
import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ArticleCard } from "@/components/common/ArticleCard";
import { SkeletonList } from "@/components/common/Skeletons";
import { UiButton, UiCard, UiEmptyState, UiErrorState, UiLinkButton } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import {
  focusTargetAfterRemoval,
  removedSavedIds,
  savedEntryId,
  type SavedCollectionPhase,
  type SavedEntry,
} from "@/lib/saved-collection";
import { formatCount } from "@/components/pepites/pepites-format";
import { cn } from "@/lib/utils";
import { ui } from "@/components/ui-kit";
import { NewsRowSkeleton } from "./NewsSkeletons";
import { gradientTokenForId } from "./news-data";

export type SavedArticlesPhase = SavedCollectionPhase;

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
 * "remove", rather than vanishing or breaking the list (preview mode only, see
 * `SavedEntry`).
 *
 * When a row is removed the view says so in a polite live region, and if the
 * removed row held keyboard focus (its bookmark button is gone with it) focus
 * moves to the next row's link, else the previous one's, else the container.
 */
export function SavedArticlesView(props: SavedArticlesViewProps) {
  const { t } = useI18n();
  const rootRef = useRef<HTMLDivElement>(null);
  const previousIds = useRef<string[] | null>(null);
  const focusedId = useRef<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const idsKey = props.entries.map(savedEntryId).join(",");

  useEffect(() => {
    const ids = idsKey ? idsKey.split(",") : [];
    const previous = previousIds.current;
    previousIds.current = ids;
    if (!previous) return;
    const removed = removedSavedIds(previous, ids);
    if (removed.length === 0) return;
    setAnnouncement(t("news.saved.removed_announce"));

    const root = rootRef.current;
    const lost = focusedId.current !== null && removed.includes(focusedId.current);
    const active = typeof document === "undefined" ? null : document.activeElement;
    if (!root || !lost || (active && active !== document.body)) return;
    const target = focusTargetAfterRemoval(previous, ids, focusedId.current!);
    const row = target
      ? [...root.querySelectorAll<HTMLElement>("[data-saved-id]")].find(
          (element) => element.getAttribute("data-saved-id") === target,
        )
      : undefined;
    const control = row?.querySelector<HTMLElement>("a[href]") ?? row?.querySelector("button");
    focusedId.current = target;
    (control ?? root).focus();
  }, [idsKey, t]);

  // The announcement is spoken once; clear it so the same words can be spoken
  // again for the next removal.
  useEffect(() => {
    if (!announcement) return;
    const timer = setTimeout(() => setAnnouncement(""), 4000);
    return () => clearTimeout(timer);
  }, [announcement]);

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      className="outline-none"
      onFocus={(event) => {
        const row = (event.target as HTMLElement).closest("[data-saved-id]");
        focusedId.current = row?.getAttribute("data-saved-id") ?? null;
      }}
    >
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
      <SavedArticlesBody {...props} />
    </div>
  );
}

interface SavedArticlesViewProps {
  phase: SavedArticlesPhase;
  entries: readonly SavedEntry[];
  /**
   * The account has more saves than the app lists (2,000): the number the page
   * says "more than" (the ids it holds), else `null`.
   */
  overCount?: number | null;
  hasMore: boolean;
  loadingMore: boolean;
  /** The next page failed; the rows already loaded stay. */
  moreFailed: boolean;
  onRetry: () => void;
  onLoadMore: () => void;
  onRemove: (id: string) => void;
}

function SavedArticlesBody({
  phase,
  entries,
  overCount = null,
  hasMore,
  loadingMore,
  moreFailed,
  onRetry,
  onLoadMore,
  onRemove,
}: SavedArticlesViewProps) {
  const { t, lang } = useI18n();

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
        action={
          <div className="mt-4 grid gap-2.5">
            <UiLinkButton to="/auth/login" search={{ next: "/profile/saved" }}>
              {t("auth.prompt.login")}
            </UiLinkButton>
            <UiLinkButton to="/auth/register" search={{ next: "/profile/saved" }} variant="soft">
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
      {overCount !== null && (
        <p className={cn(ui.text.secondary, ui.tone.muted)} data-testid="saved-over-limit">
          {t("news.saved.over_limit").replace("{count}", formatCount(overCount, lang))}
        </p>
      )}
      <ul className="grid gap-2.5" aria-label={t("news.section.saved")}>
        {entries.map((entry) => (
          <li key={savedEntryId(entry)} data-saved-id={savedEntryId(entry)} className="min-w-0">
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
