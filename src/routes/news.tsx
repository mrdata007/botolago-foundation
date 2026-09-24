import { createFileRoute, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { getNewsRepository } from "@/services/news";
import { followService } from "@/services/follows";
import { useAuth } from "@/auth/AuthProvider";
import { AppShell } from "@/components/shell/AppShell";
import { ArticleCard } from "@/components/common/ArticleCard";
import { Section } from "@/components/common/Section";
import { SectionHeader } from "@/components/common/SectionHeader";
import { SkeletonList } from "@/components/common/Skeletons";
import { ErrorState } from "@/components/common/States";
import { useI18n } from "@/i18n/provider";
import { UiPageTitle } from "@/components/ui-kit";
import { CategoryChips } from "@/components/news/CategoryChips";
import { ClubFilterRow } from "@/components/news/ClubFilterRow";
import { FeaturedGrid } from "@/components/news/FeaturedGrid";
import { LatestFeed, newsFeedQuery } from "@/components/news/LatestFeed";
import { prefetchFirstPageForSsr, prefetchForSsr } from "@/lib/ssr-prefetch";
import { LATEST_CAROUSEL_SIZE, LatestCarousel } from "@/components/news/LatestCarousel";
import { NewsLeadSkeleton, NewsRowSkeleton } from "@/components/news/NewsSkeletons";
import {
  deriveCategoryOptions,
  presentArticleForDisplay,
  presentNewsTeam,
  publicNewsContext,
} from "@/components/news/news-data";
import { NEWS_ENABLED } from "@/lib/feature-flags";

/**
 * While News is hidden (owner decision — see `@/lib/feature-flags`), `/news`
 * and every article URL under it redirect to Home.
 *
 * Redirect, not not-found, because:
 *   - `/news` and article permalinks were live and shared; a 404 turns every
 *     existing bookmark and outbound link into a dead end, where a redirect
 *     lands the reader on a working product and keeps working unchanged when
 *     the flag flips back on;
 *   - the pages are not *missing* — they are deliberately withheld — so a
 *     "not found" would be a lie to both readers and crawlers.
 *
 * It lives in `beforeLoad`, which TanStack Router runs before the loader and
 * before any component renders, on the server render and on client navigation
 * alike. That is what guarantees no flash of News content and no News RPC
 * call: the redirect is thrown before `loader` ever runs. `beforeLoad` on this
 * parent route also covers the `/news/$articleId` child, which is gated again
 * in its own file so the two can never drift apart.
 */
function redirectWhileNewsIsHidden(): void {
  if (!NEWS_ENABLED) throw redirect({ to: "/", replace: true });
}

export const Route = createFileRoute("/news")({
  beforeLoad: redirectWhileNewsIsHidden,
  // The lead, the top stories, the club filters and the first page of the
  // feed, with a link to every article, in the server's HTML (see
  // `@/lib/ssr-prefetch`); /news showed 118 characters and no article link
  // to a crawler before. Only for /news itself: an article page, which this
  // route also wraps, loads its own.
  loader: async ({ context, location }) => {
    if (location.pathname.replace(/\/$/, "") !== "/news") return;
    const { queryClient } = context;
    await Promise.all([
      prefetchForSsr(queryClient, [
        {
          queryKey: ["news", "home-modules-v2", "fr"],
          queryFn: () => getNewsRepository().getHomeModules("fr", 6, publicNewsContext()),
        },
        {
          queryKey: ["news", "team-filters-v2", "fr"],
          queryFn: async () =>
            (await getNewsRepository().getTeamFilters("fr", publicNewsContext())).map(
              presentNewsTeam,
            ),
        },
      ]),
      prefetchFirstPageForSsr(queryClient, newsFeedQuery("fr", null, null)),
    ]);
  },
  head: () => ({
    meta: [
      { title: "Actualités — BotolaGO" },
      {
        name: "description",
        content:
          "Toute l'actualité du football marocain : Botola Pro, mercato, analyses et interviews.",
      },
      { property: "og:title", content: "Actualités — BotolaGO" },
      {
        property: "og:description",
        content:
          "Toute l'actualité du football marocain : Botola Pro, mercato, analyses et interviews.",
      },
    ],
  }),
  component: NewsRoute,
});

function NewsRoute() {
  const isArticle = useRouterState({
    select: (state) => state.matches.some((match) => match.routeId === "/news/$articleId"),
  });
  return isArticle ? <Outlet /> : <NewsPage />;
}

function NewsPage() {
  const { t, lang } = useI18n();
  const { status } = useAuth();
  const [categorySlug, setCategorySlug] = useState<string | null>(null);
  const [clubId, setClubId] = useState<string | null>(null);

  // Editorial placements (lead + top stories) come straight from the read
  // model's `home_modules` RPC — nothing here is hardcoded or picked by the
  // client; an absent `lead` renders no lead area at all (requirement A).
  const homeQ = useQuery({
    queryKey: ["news", "home-modules-v2", lang],
    queryFn: () => getNewsRepository().getHomeModules(lang, 6, publicNewsContext()),
  });
  // Presented here rather than by `newsService.getTeamFilters`, whose
  // presenter turns a missing club colour into a literal navy that the club
  // palette would paint on every club (see `presentNewsTeam`).
  const clubsQ = useQuery({
    queryKey: ["news", "team-filters-v2", lang],
    queryFn: async () =>
      (await getNewsRepository().getTeamFilters(lang, publicNewsContext())).map(presentNewsTeam),
  });
  const followedQ = useQuery({
    queryKey: ["identity", "followed-team-ids", status],
    queryFn: () =>
      status === "authenticated" ? followService.getFollowedTeamIds() : Promise.resolve([]),
  });
  const followedIds = useMemo(() => new Set(followedQ.data ?? []), [followedQ.data]);

  const lead = homeQ.data?.lead ?? null;
  const featured = useMemo(() => homeQ.data?.featured ?? [], [homeQ.data?.featured]);
  // No editor has picked a lead or top stories: the top slot carries the
  // newest articles as a carousel instead of standing empty.
  const carousel = useMemo(
    () =>
      !lead && featured.length === 0
        ? (homeQ.data?.latest ?? []).slice(0, LATEST_CAROUSEL_SIZE)
        : [],
    [lead, featured, homeQ.data?.latest],
  );

  const categories = useMemo(
    () => deriveCategoryOptions([lead ? [lead] : [], featured, homeQ.data?.latest ?? []]),
    [lead, featured, homeQ.data?.latest],
  );

  // Latest already shown as lead/featured shouldn't repeat in the default
  // (unfiltered) chronological rail below it.
  const excludeFromLatest = useMemo(() => {
    if (categorySlug || clubId) return undefined;
    return new Set([
      ...(lead ? [lead.id] : []),
      ...featured.map((item) => item.id),
      ...carousel.map((item) => item.id),
    ]);
  }, [categorySlug, clubId, lead, featured, carousel]);

  const clubs = clubsQ.data ?? [];

  return (
    <AppShell
      backgroundVariant="news"
      pageHeader={
        // The hub title band (A-News): the Changa h1 and one sideways line of
        // category chips on the white bar. The band runs edge to edge; the kit
        // lines its content up with the reading column on a wide screen.
        <UiPageTitle title={t("news.title")}>
          {/* Content discovery — real taxonomy-driven category chips. They
              filter the Latest feed below; the editorial placements above
              it are not filtered. */}
          <CategoryChips
            categories={categories}
            selected={categorySlug}
            onSelect={setCategorySlug}
          />
        </UiPageTitle>
      }
    >
      {/* Lead + Top stories — editorial placements, degrade independently */}
      {homeQ.isLoading ? (
        <div className="grid gap-2.5">
          <NewsLeadSkeleton />
          <SkeletonList count={3}>{() => <NewsRowSkeleton />}</SkeletonList>
        </div>
      ) : homeQ.isError ? (
        <ErrorState onRetry={() => void homeQ.refetch()} />
      ) : (
        <>
          {lead && (
            // The first thing under the band, as the board sets it: no
            // visible heading (the card's own pill says "À la une"), but the
            // section keeps one for the page outline.
            <Section className="mt-0 sm:mt-0">
              <h2 className="sr-only">{t("news.section.lead")}</h2>
              <ArticleCard article={presentArticleForDisplay(lead)} variant="lead" clubs={clubs} />
            </Section>
          )}

          {featured.length > 0 && (
            <Section>
              <SectionHeader title={t("news.section.top_stories")} />
              <FeaturedGrid featured={featured} clubs={clubs} />
            </Section>
          )}

          {carousel.length > 0 && (
            <Section className="mt-0 sm:mt-0">
              <h2 className="sr-only">{t("news.section.lead")}</h2>
              <LatestCarousel articles={carousel} clubs={clubs} />
            </Section>
          )}
        </>
      )}

      {/* Latest — chronological feed with real keyset pagination */}
      <Section>
        <SectionHeader title={t("news.section.latest")} />
        {/* Club discovery: it filters this feed, so it sits on it. */}
        {clubs.length > 0 && (
          <div className="mb-2.5">
            <ClubFilterRow
              clubs={clubs}
              selected={clubId}
              onSelect={setClubId}
              followedIds={followedIds}
            />
          </div>
        )}
        <LatestFeed
          language={lang}
          categorySlug={categorySlug}
          teamId={clubId}
          clubs={clubs}
          excludeIds={excludeFromLatest}
        />
      </Section>
    </AppShell>
  );
}
