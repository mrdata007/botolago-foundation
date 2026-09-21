import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Share2 } from "lucide-react";
import { footballService } from "@/services/football";
import { newsService } from "@/services/news";
import { AppShell } from "@/components/shell/AppShell";
import { ClubCrest } from "@/components/common/ClubCrest";
import { ArticleCard } from "@/components/common/ArticleCard";
import { MatchCard } from "@/components/common/MatchCard";
import { Section } from "@/components/common/Section";
import { SectionHeader } from "@/components/common/SectionHeader";
import { ErrorState, LoadingState } from "@/components/common/States";
import { MatchScoreHeader } from "@/components/matches/MatchScoreHeader";
import { MatchTabs, type MatchTabKey } from "@/components/matches/MatchTabs";
import { EventTimeline } from "@/components/matches/EventTimeline";
import { StatComparison } from "@/components/matches/StatComparison";
import { LineupsView } from "@/components/matches/LineupsView";
import { useI18n } from "@/i18n/provider";
import { useBackTo } from "@/lib/back-navigation";
import { cn } from "@/lib/utils";
import { PUBLIC_SITE_ORIGIN } from "@/lib/article-meta";

const TAB_KEYS: MatchTabKey[] = ["summary", "stats", "lineups", "h2h"];

export const Route = createFileRoute("/matches/$matchId")({
  validateSearch: (search: Record<string, unknown>): { tab: MatchTabKey } => {
    const raw = (typeof search.tab === "string" ? search.tab : "summary") as MatchTabKey;
    return { tab: TAB_KEYS.includes(raw) ? raw : "summary" };
  },
  // Shared match links previously inherited the site-wide title/description, so
  // every match preview looked identical. The detail is fetched here (same
  // query key the component uses, so it is not fetched twice) purely to name
  // the two clubs in the metadata; a failure falls back to generic copy.
  loader: async ({ params, context }) => {
    try {
      const data = await context.queryClient.ensureQueryData({
        queryKey: ["football", "match-detail", params.matchId, "fr"],
        queryFn: () => footballService.getMatchDetailPage(params.matchId, "fr"),
      });
      const home = data.clubs.find((club) => club.id === data.match.homeClubId);
      const away = data.clubs.find((club) => club.id === data.match.awayClubId);
      if (!home || !away) return null;
      return { home: home.name.fr, away: away.name.fr };
    } catch {
      return null;
    }
  },
  head: ({ params, loaderData }) => {
    const canonical = `${PUBLIC_SITE_ORIGIN}/matches/${encodeURIComponent(params.matchId)}`;
    const title = loaderData
      ? `${loaderData.home} — ${loaderData.away} | BotolaGO`
      : "Match Botola Pro — BotolaGO";
    const description = loaderData
      ? `${loaderData.home} contre ${loaderData.away} : score en direct, composition, statistiques et temps forts sur BotolaGO.`
      : "Score en direct, compositions, statistiques et temps forts du match sur BotolaGO.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:type", content: "website" },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:url", content: canonical },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
      ],
      links: [{ rel: "canonical", href: canonical }],
    };
  },
  component: MatchDetailPage,
});

function MatchDetailPage() {
  const { matchId } = Route.useParams();
  const { tab } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { t, tr, lang, dir } = useI18n();
  // Articles and matches are the pages most often opened from a shared link,
  // where there is no in-app entry to go back to; fall back to the listing.
  const goBack = useBackTo("/matches");
  const [copied, setCopied] = useState(false);

  const detailQ = useQuery({
    queryKey: ["football", "match-detail", matchId, lang],
    queryFn: () => footballService.getMatchDetailPage(matchId, lang),
    // Live matches refresh on a calm cadence; paused while the tab is hidden.
    refetchInterval: (query) => (query.state.data?.match.status === "live" ? 30_000 : false),
    refetchIntervalInBackground: false,
  });
  const articlesQ = useQuery({
    queryKey: ["news", "feed", lang],
    queryFn: () => newsService.getArticles(lang),
  });

  const match = detailQ.data?.match;

  const clubById = (id?: string) => detailQ.data?.clubs.find((club) => club.id === id);
  const home = clubById(match?.homeClubId);
  const away = clubById(match?.awayClubId);

  const h2h = detailQ.data?.headToHead ?? [];

  const live = detailQ.data?.live;

  const related = useMemo(() => {
    if (!match || !articlesQ.data) return [];
    return articlesQ.data
      .filter((a) => a.clubIds.includes(match.homeClubId) || a.clubIds.includes(match.awayClubId))
      .slice(0, 3);
  }, [match, articlesQ.data]);

  if (detailQ.isLoading) {
    return (
      <AppShell backgroundVariant="matches">
        <LoadingState />
      </AppShell>
    );
  }

  if (detailQ.isError) {
    return (
      <AppShell backgroundVariant="matches">
        <div className="mt-8">
          <ErrorState onRetry={() => void detailQ.refetch()} />
        </div>
      </AppShell>
    );
  }

  if (!match || !home || !away || !live) {
    return (
      <AppShell backgroundVariant="matches">
        <div className="mt-8 rounded-[var(--radius-card-lg)] border border-[var(--border-subtle)] bg-[color:var(--background-elevated)] p-6 text-center shadow-card">
          <h1 className="text-lg font-black text-foreground">
            {t("matches.detail.not_found_title")}
          </h1>
          <p className="mt-2 text-sm text-[color:var(--text-secondary)]">
            {t("matches.detail.not_found_desc")}
          </p>
          <Link
            to="/matches"
            className="mt-4 inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg cta-brand px-4 text-sm font-semibold"
          >
            {t("article.back")}
          </Link>
        </div>
      </AppShell>
    );
  }

  const isLive = match.status === "live";
  const BackArrow = dir === "rtl" ? ArrowRight : ArrowLeft;

  const locale = lang === "ar" ? "ar-MA" : "fr-FR";
  const dateFmt = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(match.kickoff));

  const share = async () => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    try {
      if (typeof navigator !== "undefined" && "share" in navigator) {
        await (navigator as unknown as { share: (d: ShareData) => Promise<void> }).share({
          title: `${tr(home.shortName)} ${t("matches.vs")} ${tr(away.shortName)}`,
          text: `${t("matches.competition.botola")} · ${dateFmt}`,
          url,
        });
        return;
      }
    } catch {
      /* user cancelled or blocked */
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  };

  const homeRow = detailQ.data?.standings.find((row) => row.clubId === home.id);
  const awayRow = detailQ.data?.standings.find((row) => row.clubId === away.id);

  return (
    <AppShell backgroundVariant="matches">
      {/* Reading actions */}
      <div className="mt-1 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={goBack}
          aria-label={t("article.back")}
          className={cn(
            "inline-flex h-11 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-foreground",
            "bg-[color:var(--surface-glass-strong)] backdrop-blur-md",
            "border border-[var(--glass-border)] shadow-subtle",
            "hover:bg-[color:var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-accent)]",
          )}
        >
          <BackArrow className="h-4 w-4" aria-hidden />
          <span>{t("article.back")}</span>
        </button>
        <button
          type="button"
          onClick={share}
          aria-label={t("article.share")}
          className="inline-flex h-11 w-11 items-center justify-center rounded-full text-foreground hover:bg-[color:var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-accent)]"
        >
          <Share2 className="h-5 w-5" aria-hidden />
        </button>
      </div>

      {copied && (
        <div
          role="status"
          aria-live="polite"
          className="mt-2 rounded-full bg-[color:var(--brand-accent)]/10 px-3 py-1 text-center text-xs font-semibold text-[color:var(--brand-accent)]"
        >
          {t("article.share_copied")}
        </div>
      )}

      <MatchScoreHeader match={match} home={home} away={away} elapsed={live.elapsed} />

      {isLive && (
        <p className="mt-2 text-center text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--text-muted)]">
          {t("matches.detail.live_updating")}
        </p>
      )}

      <MatchTabs
        active={tab}
        onChange={(key) => navigate({ search: { tab: key }, replace: true })}
      />

      <div role="tabpanel" className="mt-5">
        {tab === "summary" && (
          <EventTimeline events={live.events} home={home} away={away} isLive={isLive} />
        )}

        {tab === "stats" && (
          <StatComparison
            stats={live.stats}
            homeName={tr(home.shortName)}
            awayName={tr(away.shortName)}
          />
        )}

        {tab === "lineups" && (
          <div>
            <SectionHeader
              title={t("matches.detail.lineups_title")}
              eyebrow={t("matches.detail.tab.lineups")}
            />
            <LineupsView lineups={detailQ.data?.lineups ?? []} home={home} away={away} />
          </div>
        )}

        {tab === "h2h" && (
          <div>
            {(homeRow || awayRow) && (
              <>
                <SectionHeader
                  title={t("matches.detail.table_context")}
                  eyebrow={t("matches.table_preview")}
                />
                <div className="grid grid-cols-2 gap-2">
                  <StandingsCard clubName={tr(home.shortName)} club={home} row={homeRow} />
                  <StandingsCard clubName={tr(away.shortName)} club={away} row={awayRow} />
                </div>
              </>
            )}

            <Section index={0}>
              <SectionHeader title={t("matches.detail.head_to_head")} eyebrow="H2H" />
              {h2h.length === 0 ? (
                <div className="rounded-[var(--radius-card-lg)] border border-dashed border-[var(--border-subtle)] bg-[color:var(--surface)]/40 px-4 py-6 text-center text-sm text-[color:var(--text-secondary)]">
                  {t("matches.detail.no_h2h")}
                </div>
              ) : (
                <div className="grid gap-2">
                  {h2h.map((m) => {
                    const h = clubById(m.homeClubId);
                    const a = clubById(m.awayClubId);
                    if (!h || !a) return null;
                    return <MatchCard key={m.id} match={m} home={h} away={a} variant="compact" />;
                  })}
                </div>
              )}
            </Section>
          </div>
        )}
      </div>

      {/* Related news */}
      {related.length > 0 && (
        <Section index={1}>
          <SectionHeader title={t("matches.detail.related_news")} eyebrow={t("news.title")} />
          <div className="grid gap-2.5">
            {related.map((a) => (
              <ArticleCard
                key={a.id}
                article={a}
                variant="horizontal"
                clubs={detailQ.data?.clubs ?? []}
              />
            ))}
          </div>
        </Section>
      )}

      <div className="h-6" aria-hidden />
    </AppShell>
  );
}

function StandingsCard({
  club,
  clubName,
  row,
}: {
  club: import("@/types/domain").Club;
  clubName: string;
  row?: import("@/types/domain").TableRow;
}) {
  const { t } = useI18n();
  if (!row) {
    return (
      <div className="surface-2 flex items-center gap-2 p-3">
        <ClubCrest club={club} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold text-foreground">{clubName}</div>
          <div className="truncate text-[10px] text-[color:var(--text-muted)]">
            {t("matches.detail.table_context")}
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="surface-2 flex items-center gap-2 p-3">
      <ClubCrest club={club} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-bold text-foreground">{clubName}</div>
        <div className="mt-0.5 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--text-muted)]">
          <span className="tabular-nums text-[color:var(--brand-primary)]">#{row.position}</span>
          <span aria-hidden>·</span>
          <span className="tabular-nums">{row.points} pts</span>
          <span aria-hidden>·</span>
          <span className="tabular-nums">
            {row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}
          </span>
        </div>
      </div>
    </div>
  );
}
