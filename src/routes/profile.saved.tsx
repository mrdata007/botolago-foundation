import { createFileRoute, redirect } from "@tanstack/react-router";
import { AppShell } from "@/components/shell/AppShell";
import { UiHeader } from "@/components/ui-kit";
import { SavedArticlesView } from "@/components/news/SavedArticlesView";
import { useSavedCollection } from "@/components/news/useSavedCollection";
import { useI18n } from "@/i18n/provider";
import { NEWS_ENABLED } from "@/lib/feature-flags";

/**
 * The reader's saved articles (`/profile/saved`): the place the "Enregistrer"
 * bookmark leads to. It sits under Profile because the list belongs to the
 * account, and Profile is where the count already was; the News screen links
 * here too. It is a personal page: `/profile` is disallowed in robots.txt and
 * answered `private, no-store` (`withSiteHeaders`), and it is `noindex` as well.
 *
 * While News is hidden (`NEWS_ENABLED`) there is nothing to save from, so this
 * goes back to Profile, like the News routes do for Home.
 */
export const Route = createFileRoute("/profile/saved")({
  beforeLoad: () => {
    if (!NEWS_ENABLED) throw redirect({ to: "/profile", replace: true });
  },
  head: () => ({
    meta: [
      { title: "Articles enregistrés — BotolaGO" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: SavedArticlesPage,
});

function SavedArticlesPage() {
  const { t } = useI18n();
  const collection = useSavedCollection();
  return (
    <AppShell
      topBar={
        <UiHeader
          sticky
          kicker={t("profile.title")}
          title={t("news.section.saved")}
          backTo="/profile"
        />
      }
    >
      <SavedArticlesView
        phase={collection.phase}
        entries={collection.entries}
        hasMore={collection.hasMore}
        loadingMore={collection.loadingMore}
        moreFailed={collection.moreFailed}
        onRetry={collection.retry}
        onLoadMore={collection.loadMore}
        onRemove={collection.remove}
      />
    </AppShell>
  );
}
