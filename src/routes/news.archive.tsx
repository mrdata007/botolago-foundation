import { PUBLIC_SITE_ORIGIN } from "@/lib/article-meta";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/shell/AppShell";
import { ArticleCard } from "@/components/common/ArticleCard";
import { Section } from "@/components/common/Section";
import { SkeletonList } from "@/components/common/Skeletons";
import { EmptyState, ErrorState } from "@/components/common/States";
import { ui, UiPageTitle } from "@/components/ui-kit";
import { ArchivePagination } from "@/components/news/ArchivePagination";
import { NewsRowSkeleton } from "@/components/news/NewsSkeletons";
import {
  archiveCursorFor,
  archivePageCount,
  archivePageOf,
  validateNewsArchiveSearch,
  type NewsArchivePlans,
} from "@/components/news/news-archive";
import { newsArchivePageQuery, newsArchivePlansQuery } from "@/components/news/news-archive-query";
import {
  presentArticleForDisplay,
  presentNewsTeam,
  publicNewsContext,
} from "@/components/news/news-data";
import { useI18n } from "@/i18n/provider";
import { UNAVAILABLE, unavailableHeaders } from "@/lib/page-availability";
import { isServerRender, prefetchForSsr, ssrAvailability } from "@/lib/ssr-prefetch";
import { cn } from "@/lib/utils";
import { getNewsRepository } from "@/services/news";

/**
 * Every published article, 50 to a page, newest first, each a plain link, with
 * numbered links to the other pages: the way a crawler that does not press
 * "Voir plus d'articles" reaches the whole archive (SEO brief 2026-10-27,
 * Bug 1; the hub's server HTML linked about ten of 15,800). How the pages are
 * cut is in `@/components/news/news-archive`.
 *
 * It sits under `/news`, so the News flag redirects it to Home with the rest
 * (`redirectWhileNewsIsHidden`).
 */
export const Route = createFileRoute("/news/archive")({
  validateSearch: validateNewsArchiveSearch,
  loaderDeps: ({ search }) => ({ page: archivePageOf(search) }),
  // Server only: the plan (where each page starts) and the page's articles go
  // into the HTML. A page past the last is a 404, a failed read a 503.
  loader: async ({ context, deps }) => {
    const { page } = deps;
    if (!isServerRender()) return { page, lastPage: null };
    const { queryClient } = context;
    const plansQuery = newsArchivePlansQuery();
    await prefetchForSsr(queryClient, [plansQuery]);
    const plans = queryClient.getQueryData<NewsArchivePlans>(plansQuery.queryKey);
    if (!plans) return { ...UNAVAILABLE, page, lastPage: null };
    const cursor = archiveCursorFor(plans.fr, page);
    if (cursor === undefined) throw notFound();
    const pageQuery = newsArchivePageQuery("fr", page, cursor);
    await prefetchForSsr(queryClient, [pageQuery]);
    return {
      ...ssrAvailability(queryClient),
      page,
      lastPage: archivePageCount(plans.fr),
    };
  },
  headers: ({ loaderData }) => unavailableHeaders(loaderData),
  head: ({ loaderData }) => {
    const page = loaderData?.page ?? 1;
    const last = loaderData?.lastPage ?? null;
    const url = (n: number) => `${PUBLIC_SITE_ORIGIN}/news/archive${n > 1 ? `?page=${n}` : ""}`;
    const title =
      page > 1
        ? `Archives des actualités, page ${page} — BotolaGO`
        : "Archives des actualités — BotolaGO";
    const description =
      page > 1
        ? `Les articles du football marocain, page ${page} des archives, du plus récent au plus ancien.`
        : "Tous les articles du football marocain, du plus récent au plus ancien : Botola Pro, mercato, analyses et interviews.";
    return {
      links: [
        { rel: "canonical", href: url(page) },
        ...(page > 1 ? [{ rel: "prev", href: url(page - 1) }] : []),
        ...(last !== null && page < last ? [{ rel: "next", href: url(page + 1) }] : []),
      ],
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
      ],
    };
  },
  component: NewsArchivePage,
});

function NewsArchivePage() {
  const { t, lang } = useI18n();
  const page = archivePageOf(validateNewsArchiveSearch(Route.useSearch()));
  const plansQ = useQuery(newsArchivePlansQuery());
  const plan = plansQ.data?.[lang];
  // The first page needs no plan to be read; every other page waits for it.
  const cursor = page === 1 ? null : plan ? archiveCursorFor(plan, page) : undefined;
  const pageQ = useQuery({
    ...newsArchivePageQuery(lang, page, cursor ?? null),
    enabled: cursor !== undefined,
  });
  // The club colours on the cards; the cards are links without them.
  const clubsQ = useQuery({
    queryKey: ["news", "team-filters-v2", lang],
    queryFn: async () =>
      (await getNewsRepository().getTeamFilters(lang, publicNewsContext())).map(presentNewsTeam),
  });
  const clubs = clubsQ.data ?? [];
  const items = pageQ.data?.items ?? [];
  const last = plan ? archivePageCount(plan) : null;

  return (
    <AppShell
      contentWidth="wide"
      backgroundVariant="news"
      pageHeader={
        <UiPageTitle title={t("news.archive.title")}>
          {last !== null && last > 1 && (
            <p className={cn(ui.text.meta, ui.tone.muted)}>
              {t("news.archive.page_of")
                .replace("{page}", String(page))
                .replace("{total}", String(last))}
            </p>
          )}
        </UiPageTitle>
      }
    >
      <Section className="mt-3 sm:mt-5">
        {pageQ.isError || plansQ.isError ? (
          <ErrorState
            message={t("news.load_failed")}
            onRetry={() => {
              void pageQ.refetch();
              void plansQ.refetch();
            }}
          />
        ) : cursor === undefined && plan ? (
          <EmptyState>{t("news.empty")}</EmptyState>
        ) : pageQ.isLoading || cursor === undefined ? (
          <SkeletonList count={6}>{() => <NewsRowSkeleton />}</SkeletonList>
        ) : items.length === 0 ? (
          <EmptyState>{t("news.empty")}</EmptyState>
        ) : (
          <ol className="grid gap-2.5 lg:grid-cols-2">
            {items.map((dto) => (
              <li key={dto.id} className="min-w-0">
                <ArticleCard
                  article={presentArticleForDisplay(dto)}
                  variant="horizontal"
                  clubs={clubs}
                />
              </li>
            ))}
          </ol>
        )}
        {plan && <ArchivePagination page={page} plan={plan} />}
      </Section>
    </AppShell>
  );
}
