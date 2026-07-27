import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import {
  Newspaper,
  Flame,
  Clock,
  Sparkles,
  Bookmark,
  ArrowRightLeft,
  PieChart,
  MessageSquare,
} from "lucide-react";
import { newsService } from "@/services/news";
import { followService } from "@/services/follows";
import { useAuth } from "@/auth/AuthProvider";
import { AppShell } from "@/components/shell/AppShell";
import { ArticleCard } from "@/components/common/ArticleCard";
import { ClubCrest } from "@/components/common/ClubCrest";
import { Section } from "@/components/common/Section";
import { SectionHeader } from "@/components/common/SectionHeader";
import { ArticleCardSkeleton, SkeletonList } from "@/components/common/Skeletons";
import { EmptyState } from "@/components/common/States";
import { useI18n } from "@/i18n/provider";
import { useSavedArticles } from "@/lib/saved-articles";
import type { Article, ArticleCategory } from "@/types/domain";
import type { TranslationKey } from "@/i18n/dictionaries";
import { cn } from "@/lib/utils";

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
  component: NewsPage,
});

const tabs: { key: ArticleCategory; label: TranslationKey }[] = [
  { key: "for_you", label: "news.tab.for_you" },
  { key: "latest", label: "news.tab.latest" },
  { key: "transfers", label: "news.tab.transfers" },
  { key: "analysis", label: "news.tab.analysis" },
  { key: "interviews", label: "news.tab.interviews" },
];

function NewsPage() {
  const { t, tr, lang } = useI18n();
  const { status, requireAuth } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<ArticleCategory>("for_you");
  const [clubFilter, setClubFilter] = useState<string | null>(null);
  const { ids: savedIds } = useSavedArticles();

  const allQ = useQuery({
    queryKey: ["news", "feed", lang],
    queryFn: () => newsService.getArticles(lang),
  });
  const clubsQ = useQuery({
    queryKey: ["news", "team-filters", lang],
    queryFn: () => newsService.getTeamFilters(lang),
  });
  const leadQ = useQuery({
    queryKey: ["news", "home-modules", lang],
    queryFn: () => newsService.getHome(lang).then((modules) => modules.lead),
  });
  const followedQ = useQuery({
    queryKey: ["identity", "followed-team-ids", status],
    queryFn: () =>
      status === "authenticated" ? followService.getFollowedTeamIds() : Promise.resolve([]),
  });
  const followedIds = useMemo(() => new Set(followedQ.data ?? []), [followedQ.data]);
  const followMutation = useMutation({
    mutationFn: ({ teamId, follow }: { teamId: string; follow: boolean }) =>
      follow ? followService.followTeam(teamId) : followService.unfollowTeam(teamId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["identity", "followed-team-ids"] });
      await queryClient.invalidateQueries({ queryKey: ["identity", "followed-teams"] });
    },
  });

  const isLoading = allQ.isLoading || leadQ.isLoading;
  const list = useMemo(() => allQ.data ?? [], [allQ.data]);
  const lead = leadQ.data;

  const byClub = useCallback(
    (arr: Article[]) => (clubFilter ? arr.filter((a) => a.clubIds.includes(clubFilter)) : arr),
    [clubFilter],
  );

  const forYou = useMemo(() => byClub(list.filter((a) => a.id !== lead?.id)), [list, lead, byClub]);
  const topStories = useMemo(() => forYou.slice(0, 3), [forYou]);
  const latest = useMemo(
    () => [...forYou].sort((a, b) => +new Date(b.publishedAt) - +new Date(a.publishedAt)),
    [forYou],
  );
  const transfers = useMemo(
    () => byClub(list.filter((a) => a.category === "transfers")),
    [list, byClub],
  );
  const analysis = useMemo(
    () => byClub(list.filter((a) => a.category === "analysis")),
    [list, byClub],
  );
  const interviews = useMemo(
    () => byClub(list.filter((a) => a.category === "interviews")),
    [list, byClub],
  );
  const savedList = useMemo(
    () => byClub(list.filter((a) => savedIds.includes(a.id))),
    [list, savedIds, byClub],
  );

  const filteredForTab = useMemo(() => {
    if (tab === "for_you") return null;
    return byClub(list.filter((a) => a.category === tab));
  }, [tab, list, byClub]);

  return (
    <AppShell backgroundVariant="news">
      <h1 className="pt-2 text-2xl font-black tracking-tight text-foreground">
        <span className="text-brand">{t("news.title")}</span>
      </h1>

      {/* Tabs */}
      <div className="sticky top-[var(--topbar-h)] z-20 -mx-3 mt-3 px-3 pb-2 pt-1">
        <div
          role="tablist"
          aria-label={t("news.title")}
          className="glass-surface glass-strong flex items-center gap-1 overflow-x-auto rounded-2xl border border-[var(--glass-border)] p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {tabs.map((it) => (
            <button
              key={it.key}
              role="tab"
              onClick={() => setTab(it.key)}
              className={cn(
                "shrink-0 rounded-xl px-3 py-2 text-xs font-semibold transition-colors",
                "min-h-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-accent)]",
                tab === it.key
                  ? "bg-[var(--brand-primary)] text-white shadow"
                  : "text-muted-foreground hover:text-foreground",
              )}
              aria-selected={tab === it.key}
              aria-pressed={tab === it.key}
            >
              {t(it.label)}
            </button>
          ))}
        </div>
      </div>

      {/* Club filters */}
      <Section index={0} className="mt-4">
        <div className="mb-2 text-[10px] font-black uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
          {t("news.filter_clubs")}
        </div>
        <div className="flex flex-wrap gap-2">
          <FilterChip active={clubFilter === null} onClick={() => setClubFilter(null)}>
            {t("news.filter_all")}
          </FilterChip>
          {clubsQ.data?.map((c) => (
            <FilterChip
              key={c.id}
              active={clubFilter === c.id}
              onClick={() => setClubFilter(clubFilter === c.id ? null : c.id)}
              leading={<ClubCrest club={c} size="sm" className="h-8 w-8 rounded-full" />}
              trailing={
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    requireAuth(() =>
                      followMutation.mutate({
                        teamId: c.id,
                        follow: !followedIds.has(c.id),
                      }),
                    );
                  }}
                  aria-pressed={followedIds.has(c.id)}
                  disabled={followMutation.isPending}
                  className={cn(
                    "ms-1 rounded-md px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide",
                    followedIds.has(c.id)
                      ? "bg-[color:var(--brand-accent)] text-white"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {followedIds.has(c.id) ? t("news.following") : t("news.follow")}
                </button>
              }
            >
              {tr(c.shortName)}
            </FilterChip>
          ))}
        </div>
      </Section>

      {isLoading ? (
        <div className="mt-4 space-y-4">
          <ArticleCardSkeleton variant="lead" />
          <SkeletonList count={3}>{() => <ArticleCardSkeleton />}</SkeletonList>
        </div>
      ) : filteredForTab ? (
        <Section index={1}>
          <SectionHeader
            title={t(
              `news.section.${tab === "latest" ? "latest" : tab === "transfers" ? "transfers" : tab === "analysis" ? "analysis" : "interviews"}` as TranslationKey,
            )}
            icon={
              tab === "transfers"
                ? ArrowRightLeft
                : tab === "analysis"
                  ? PieChart
                  : tab === "interviews"
                    ? MessageSquare
                    : Clock
            }
            eyebrow={t(`news.tab.${tab}` as TranslationKey)}
          />
          {filteredForTab.length === 0 ? (
            <EmptyState>{t("news.empty_category")}</EmptyState>
          ) : (
            <div className="grid gap-3">
              {filteredForTab.map((a) => (
                <ArticleCard key={a.id} article={a} clubs={clubsQ.data ?? []} />
              ))}
            </div>
          )}
        </Section>
      ) : (
        <>
          {/* Lead */}
          {lead && (
            <Section index={1}>
              <SectionHeader
                eyebrow={t("news.section.lead")}
                icon={Sparkles}
                title={t("news.section.lead")}
              />
              <ArticleCard article={lead} variant="lead" clubs={clubsQ.data ?? []} />
            </Section>
          )}

          {/* Top stories — image-led grid */}
          {topStories.length > 0 && (
            <Section index={2}>
              <SectionHeader
                title={t("news.section.top_stories")}
                icon={Flame}
                eyebrow={t("news.section.top_stories")}
              />
              <div className="grid grid-cols-2 gap-3">
                {topStories.slice(0, 2).map((a) => (
                  <ArticleCard key={a.id} article={a} variant="imageLed" clubs={clubsQ.data ?? []} />
                ))}
              </div>
              {topStories[2] && (
                <div className="mt-3">
                  <ArticleCard article={topStories[2]} variant="horizontal" clubs={clubsQ.data ?? []} />
                </div>
              )}
            </Section>
          )}

          {/* Latest — horizontal list */}
          {latest.length > 0 && (
            <Section index={3}>
              <SectionHeader
                title={t("news.section.latest")}
                icon={Clock}
                eyebrow={t("news.section.latest")}
              />
              <div className="grid gap-2.5">
                {latest.slice(0, 5).map((a) => (
                  <ArticleCard key={a.id} article={a} variant="horizontal" clubs={clubsQ.data ?? []} />
                ))}
              </div>
            </Section>
          )}

          {/* Transfers strip */}
          {transfers.length > 0 && (
            <Section index={4}>
              <SectionHeader
                title={t("news.section.transfers")}
                icon={ArrowRightLeft}
                eyebrow={t("news.section.transfers")}
              />
              <div className="grid gap-3">
                {transfers.slice(0, 2).map((a) => (
                  <ArticleCard key={a.id} article={a} clubs={clubsQ.data ?? []} />
                ))}
              </div>
            </Section>
          )}

          {/* Analysis */}
          {analysis.length > 0 && (
            <Section index={5}>
              <SectionHeader
                title={t("news.section.analysis")}
                icon={PieChart}
                eyebrow={t("news.section.analysis")}
              />
              <div className="grid gap-3">
                {analysis.slice(0, 2).map((a) => (
                  <ArticleCard key={a.id} article={a} clubs={clubsQ.data ?? []} />
                ))}
              </div>
            </Section>
          )}

          {/* Interviews */}
          {interviews.length > 0 && (
            <Section index={6}>
              <SectionHeader
                title={t("news.section.interviews")}
                icon={MessageSquare}
                eyebrow={t("news.section.interviews")}
              />
              <div className="grid gap-2.5">
                {interviews.slice(0, 3).map((a) => (
                  <ArticleCard key={a.id} article={a} variant="horizontal" clubs={clubsQ.data ?? []} />
                ))}
              </div>
            </Section>
          )}

          {/* Saved */}
          <Section index={6}>
            <SectionHeader
              title={t("news.section.saved")}
              icon={Bookmark}
              eyebrow={t("news.section.saved")}
            />
            {savedList.length === 0 ? (
              <EmptyState compact>{t("news.saved.empty")}</EmptyState>
            ) : (
              <div className="grid gap-2.5">
                {savedList.map((a) => (
                  <ArticleCard key={a.id} article={a} variant="compact" clubs={clubsQ.data ?? []} />
                ))}
              </div>
            )}
          </Section>
        </>
      )}
    </AppShell>
  );
}

function FilterChip({
  active,
  onClick,
  children,
  leading,
  trailing,
}: {
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
}) {
  // Rendered as a role="button" span so a nested follow-toggle <button> is valid.
  return (
    <span
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.();
        }
      }}
      aria-pressed={active}
      className={cn(
        "inline-flex min-h-11 cursor-pointer select-none items-center gap-1 rounded-full border py-1 pe-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-accent)]",
        leading ? "ps-1" : "ps-3",
        active
          ? "border-[color:var(--brand-accent)] bg-[color:var(--brand-accent)] text-white"
          : "border-[var(--glass-border)] bg-white/50 text-foreground hover:bg-white/70",
      )}
    >
      {leading}
      <span>{children}</span>
      {trailing}
    </span>
  );
}

// Retain Newspaper import to prevent unused warning if we later add empty hero.
void Newspaper;
