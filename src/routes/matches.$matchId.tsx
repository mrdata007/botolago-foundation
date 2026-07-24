import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, MapPin, Trophy, CalendarClock, Share2 } from "lucide-react";
import { footballService } from "@/services/football";
import { newsService } from "@/services/news";
import { AppShell } from "@/components/shell/AppShell";
import { ClubCrest } from "@/components/common/ClubCrest";
import { ArticleCard } from "@/components/common/ArticleCard";
import { MatchCard } from "@/components/common/MatchCard";
import { LiveIndicator } from "@/components/matches/LiveIndicator";
import { Section } from "@/components/common/Section";
import { SectionHeader } from "@/components/common/SectionHeader";
import { LoadingState } from "@/components/common/States";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/matches/$matchId")({
  component: MatchDetailPage,
});

function MatchDetailPage() {
  const { matchId } = Route.useParams();
  const { t, tr, lang, dir } = useI18n();
  const router = useRouter();
  const [copied, setCopied] = useState(false);

  const detailQ = useQuery({
    queryKey: ["football", "match-detail", matchId, lang],
    queryFn: () => footballService.getMatchDetailPage(matchId, lang),
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

  if (!match || !home || !away) {
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
            className="mt-4 inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg bg-[color:var(--brand-primary)] px-4 text-sm font-semibold text-white"
          >
            {t("article.back")}
          </Link>
        </div>
      </AppShell>
    );
  }

  const kickoff = new Date(match.kickoff);
  const locale = lang === "ar" ? "ar-MA" : "fr-FR";
  const timeFmt = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(
    kickoff,
  );
  const dateFmt = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(kickoff);

  const isLive = match.status === "live";
  const isFinished = match.status === "finished";
  const isScheduled = match.status === "scheduled";
  const isPostponed = match.status === "postponed";

  const BackArrow = dir === "rtl" ? ArrowRight : ArrowLeft;

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

  const hs = match.homeScore ?? 0;
  const as = match.awayScore ?? 0;
  const scoreA11y = t("matches.a11y.score")
    .replace("{home}", tr(home.shortName))
    .replace("{hs}", String(hs))
    .replace("{away}", tr(away.shortName))
    .replace("{as}", String(as));

  return (
    <AppShell backgroundVariant="matches">
      {/* Reading actions */}
      <div className="mt-1 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => router.history.back()}
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

      {/* Score header */}
      <header
        className={cn(
          "relative mt-4 overflow-hidden rounded-[var(--radius-hero)] border border-[var(--border-subtle)]",
          "bg-[color:var(--background-elevated)] shadow-card px-4 py-5 sm:px-6 sm:py-6",
          "animate-in fade-in-0 slide-in-from-bottom-1 duration-500 ease-out",
        )}
        aria-label={scoreA11y}
      >
        {/* Ambient brand gradient wash for live and finished */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-24 h-40 opacity-40"
          style={{
            background:
              "radial-gradient(600px 240px at 50% 100%, color-mix(in oklab, var(--brand-primary) 22%, transparent) 0%, transparent 70%)",
          }}
        />

        {/* Competition + status */}
        <div className="relative flex items-center justify-between gap-2">
          <div className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-[color:var(--brand-accent)]">
            <Trophy className="h-3.5 w-3.5" aria-hidden />
            {t("matches.competition.botola")} · {t("matches.gameweek")} {match.gameweek}
          </div>
          <div>
            {isLive ? (
              <LiveIndicator minute={match.minute} size="md" />
            ) : isFinished ? (
              <span className="inline-flex items-center rounded-full bg-[color:var(--surface-hover)] px-2 py-0.5 text-[11px] font-black uppercase tracking-[0.14em] text-[color:var(--text-secondary)]">
                {t("matches.status.ft")}
              </span>
            ) : isScheduled ? (
              <span className="inline-flex items-center rounded-full bg-[color:var(--surface-hover)] px-2 py-0.5 text-[11px] font-black uppercase tracking-[0.14em] text-[color:var(--text-muted)]">
                {t("matches.status.scheduled")}
              </span>
            ) : isPostponed ? (
              <span
                className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-black uppercase tracking-[0.14em]"
                style={{
                  background: "color-mix(in oklab, var(--color-warning) 14%, transparent)",
                  color: "color-mix(in oklab, var(--color-warning) 60%, black)",
                }}
              >
                {t("matches.status.postponed")}
              </span>
            ) : null}
          </div>
        </div>

        {/* Teams + score / time */}
        <div className="relative mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-4">
          <div className="flex min-w-0 flex-col items-center gap-2">
            <ClubCrest club={home} size="lg" />
            <div className="min-w-0 text-center text-sm font-black tracking-tight text-foreground">
              <div className="truncate">{tr(home.shortName)}</div>
              <div className="mt-0.5 truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--text-muted)]">
                {tr(home.city)}
              </div>
            </div>
          </div>

          <div className="flex flex-col items-center px-1">
            {isLive || isFinished ? (
              <div
                className="flex items-baseline gap-2 font-mono text-4xl font-black tabular-nums tracking-tight text-foreground sm:text-5xl"
                aria-hidden
              >
                <span>{hs}</span>
                <span className="text-[color:var(--text-muted)]">–</span>
                <span>{as}</span>
              </div>
            ) : (
              <div className="flex flex-col items-center">
                <div className="font-mono text-3xl font-black tabular-nums text-foreground sm:text-4xl">
                  {timeFmt}
                </div>
                <div className="mt-0.5 text-[10px] font-black uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
                  {t("matches.kickoff")}
                </div>
              </div>
            )}
          </div>

          <div className="flex min-w-0 flex-col items-center gap-2">
            <ClubCrest club={away} size="lg" />
            <div className="min-w-0 text-center text-sm font-black tracking-tight text-foreground">
              <div className="truncate">{tr(away.shortName)}</div>
              <div className="mt-0.5 truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--text-muted)]">
                {tr(away.city)}
              </div>
            </div>
          </div>
        </div>

        {/* Meta row */}
        <div className="relative mt-5 grid grid-cols-1 gap-2 border-t border-[var(--border-subtle)] pt-3 sm:grid-cols-3">
          <MetaCell
            icon={<CalendarClock className="h-3.5 w-3.5" aria-hidden />}
            label={t("matches.detail.kickoff")}
            value={`${dateFmt} · ${timeFmt}`}
          />
          <MetaCell
            icon={<Trophy className="h-3.5 w-3.5" aria-hidden />}
            label={t("matches.detail.competition")}
            value={t("matches.competition.botola")}
          />
          <MetaCell
            icon={<MapPin className="h-3.5 w-3.5" aria-hidden />}
            label={t("matches.detail.venue")}
            value={tr(match.venue)}
          />
        </div>
      </header>

      {/* Table context */}
      {(homeRow || awayRow) && (
        <Section index={0}>
          <SectionHeader
            title={t("matches.detail.table_context")}
            eyebrow={t("matches.table_preview")}
          />
          <div className="grid grid-cols-2 gap-2">
            <StandingsCard clubName={tr(home.shortName)} club={home} row={homeRow} />
            <StandingsCard clubName={tr(away.shortName)} club={away} row={awayRow} />
          </div>
        </Section>
      )}

      {/* Head-to-head */}
      <Section index={1}>
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

      {/* Related news */}
      {related.length > 0 && (
        <Section index={2}>
          <SectionHeader title={t("matches.detail.related_news")} eyebrow={t("news.title")} />
          <div className="grid gap-2.5">
            {related.map((a) => (
              <ArticleCard key={a.id} article={a} variant="horizontal" />
            ))}
          </div>
        </Section>
      )}

      <div className="h-6" aria-hidden />
    </AppShell>
  );
}

function MetaCell({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-[color:var(--text-muted)]">
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-0.5 truncate text-[13px] font-semibold text-foreground">{value}</div>
    </div>
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
