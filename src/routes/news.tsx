import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
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
import { CategoryChips } from "@/components/news/CategoryChips";
import { ClubFilterRow } from "@/components/news/ClubFilterRow";
import { FeaturedGrid } from "@/components/news/FeaturedGrid";
import { LatestFeed } from "@/components/news/LatestFeed";
import {
  deriveCategoryOptions,
  presentArticleForDisplay,
  publicNewsContext,
} from "@/components/news/news-data";

export const Route = createFileRoute("/news")({
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
      <h1 className="pt-2 text-2xl font-black tracking-tight text-foreground">
        <span className="text-brand">{t("news.title")}</span>
      </h1>

      {/* Content discovery — real taxonomy-driven category chips */}
      <Section index={0} className="mt-4">
        <CategoryChips categories={categories} selected={categorySlug} onSelect={setCategorySlug} />
      </Section>

      {/* Club discovery */}
      <Section index={0} className="mt-3">
        <h2 className="mb-2 text-[10px] font-black uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
          {t("news.filter_clubs")}
        </h2>
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
            <Section index={1}>
              <SectionHeader
                eyebrow={t("news.section.lead")}
                icon={Sparkles}
                title={t("news.section.lead")}
              />
              <ArticleCard article={presentArticleForDisplay(lead)} variant="lead" clubs={clubs} />
            </Section>
          )}

          {featured.length > 0 && (
            <Section index={2}>
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
              <EmptyState>{t("state.empty")}</EmptyState>
            </div>
          )}
        </>
      )}

      {/* Latest — chronological feed with real keyset pagination */}
      <Section index={3}>
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
