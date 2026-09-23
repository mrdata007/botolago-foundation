import emptyNewsArt from "@/assets/illustrations/empty-news.webp";
import newsHeaderPhoto from "@/assets/photos/news-header.webp";
import { PhotoPageHeader } from "@/components/common/PhotoPageHeader";
import { createFileRoute, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Sparkles, Flame, Clock } from "lucide-react";
import { getNewsRepository, newsService } from "@/services/news";
import { followService } from "@/services/follows";
import { useAuth } from "@/auth/AuthProvider";
import { AppShell } from "@/components/shell/AppShell";
import { ArticleCard } from "@/components/common/ArticleCard";
import { Section } from "@/components/common/Section";
import { SectionHeader } from "@/components/common/SectionHeader";
import { ArticleCardSkeleton, SkeletonList } from "@/components/common/Skeletons";
import { EmptyState, ErrorState } from "@/components/common/States";
import { useI18n } from "@/i18n/provider";
import { ui } from "@/components/ui-kit";
import { cn } from "@/lib/utils";
import { CategoryChips } from "@/components/news/CategoryChips";
import { ClubFilterRow } from "@/components/news/ClubFilterRow";
import { FeaturedGrid } from "@/components/news/FeaturedGrid";
import { LatestFeed } from "@/components/news/LatestFeed";
import {
  deriveCategoryOptions,
  presentArticleForDisplay,
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
  const clubsQ = useQuery({
    queryKey: ["news", "team-filters", lang],
    queryFn: () => newsService.getTeamFilters(lang),
  });
  const followedQ = useQuery({
    queryKey: ["identity", "followed-team-ids", status],
    queryFn: () =>
      status === "authenticated" ? followService.getFollowedTeamIds() : Promise.resolve([]),
  });
  const followedIds = useMemo(() => new Set(followedQ.data ?? []), [followedQ.data]);

  const lead = homeQ.data?.lead ?? null;
  const featured = useMemo(() => homeQ.data?.featured ?? [], [homeQ.data?.featured]);

  const categories = useMemo(
    () => deriveCategoryOptions([lead ? [lead] : [], featured, homeQ.data?.latest ?? []]),
    [lead, featured, homeQ.data?.latest],
  );

  // Latest already shown as lead/featured shouldn't repeat in the default
  // (unfiltered) chronological rail below it.
  const excludeFromLatest = useMemo(() => {
    if (categorySlug || clubId) return undefined;
    return new Set([...(lead ? [lead.id] : []), ...featured.map((item) => item.id)]);
  }, [categorySlug, clubId, lead, featured]);

  const clubs = clubsQ.data ?? [];

  return (
    <AppShell backgroundVariant="news">
      <PhotoPageHeader photo={newsHeaderPhoto} title={t("news.title")} />

      {/* Content discovery — real taxonomy-driven category chips */}
      <Section className="mt-4">
        <CategoryChips categories={categories} selected={categorySlug} onSelect={setCategorySlug} />
      </Section>

      {/* Club discovery */}
      <Section className="mt-3">
        {/* `ui.text.label` carries the `ltr:`-prefixed tracking: Arabic
            letterforms join and must never be letter-spaced (BG-0069). */}
        <h2 className={cn("mb-2", ui.text.label, ui.tone.muted)}>{t("news.filter_clubs")}</h2>
        <ClubFilterRow
          clubs={clubs}
          selected={clubId}
          onSelect={setClubId}
          followedIds={followedIds}
        />
      </Section>

      {/* Lead + Top stories — editorial placements, degrade independently */}
      {homeQ.isLoading ? (
        <div className="mt-4 space-y-4">
          <ArticleCardSkeleton variant="lead" />
          <SkeletonList count={3}>{() => <ArticleCardSkeleton />}</SkeletonList>
        </div>
      ) : homeQ.isError ? (
        <div className="mt-4">
          <ErrorState onRetry={() => void homeQ.refetch()} />
        </div>
      ) : (
        <>
          {lead && (
            <Section>
              <SectionHeader
                eyebrow={t("news.section.lead")}
                icon={Sparkles}
                title={t("news.section.lead")}
              />
              <ArticleCard article={presentArticleForDisplay(lead)} variant="lead" clubs={clubs} />
            </Section>
          )}

          {featured.length > 0 && (
            <Section>
              <SectionHeader
                title={t("news.section.top_stories")}
                icon={Flame}
                eyebrow={t("news.section.top_stories")}
              />
              <FeaturedGrid featured={featured} clubs={clubs} />
            </Section>
          )}

          {!lead && featured.length === 0 && (
            <div className="mt-4">
              <EmptyState illustration={emptyNewsArt}>{t("state.empty")}</EmptyState>
            </div>
          )}
        </>
      )}

      {/* Latest — chronological feed with real keyset pagination */}
      <Section>
        <SectionHeader
          title={t("news.section.latest")}
          icon={Clock}
          eyebrow={t("news.section.latest")}
        />
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
