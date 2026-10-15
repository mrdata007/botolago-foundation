import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { AppShell } from "@/components/shell/AppShell";
import { UiHeader } from "@/components/ui-kit";
import { SavedArticlesView } from "@/components/news/SavedArticlesView";
import { useSavedCollection } from "@/components/news/useSavedCollection";
import { useI18n } from "@/i18n/provider";
import { redirectWhileNewsIsHidden } from "./news";

/**
 * The reader's saved articles (`/profile/saved`): the place the "Enregistrer"
 * bookmark leads to. It sits under Profile because the list belongs to the
 * account, and Profile is where the count already was; the News screen links
 * here too. It is a personal page: `/profile` is disallowed in robots.txt and
 * answered `private, no-store` (`withSiteHeaders`), and it is `noindex` as well.
 *
 * While News is hidden (`NEWS_ENABLED`) there is nothing to save from, so this
 * redirects Home exactly as the News routes do (`redirectWhileNewsIsHidden`).
 */
export const Route = createFileRoute("/profile/saved")({
  beforeLoad: redirectWhileNewsIsHidden,
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
  const router = useRouter();
  const navigate = useNavigate();
  // Back to where the reader came from (News or Profile); a page opened
  // directly has nothing to go back to, so it falls back to Profile.
  const goBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) router.history.back();
    else void navigate({ to: "/profile", replace: true });
  };
  return (
    <AppShell
      topBar={
        <UiHeader
          sticky
          kicker={t("profile.title")}
          title={t("news.section.saved")}
          onBack={goBack}
        />
      }
    >
      <SavedArticlesView
        phase={collection.phase}
        entries={collection.entries}
        overCount={collection.overCount}
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
