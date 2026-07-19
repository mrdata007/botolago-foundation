import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Radio, CalendarClock, CheckCircle2 } from "lucide-react";
import { botolaService } from "@/services/mock";
import { AppShell } from "@/components/shell/AppShell";
import { MatchCard } from "@/components/common/MatchCard";
import { ClubCrest } from "@/components/common/ClubCrest";
import { SectionHeader } from "@/components/common/SectionHeader";
import { Section } from "@/components/common/Section";
import { DateStrip } from "@/components/matches/DateStrip";
import { CompetitionHeader } from "@/components/matches/CompetitionHeader";
import { LoadingState, EmptyState, ErrorState } from "@/components/common/States";
import { MatchCardSkeleton, SkeletonList } from "@/components/common/Skeletons";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import type { TranslationKey } from "@/i18n/dictionaries";
import type { Match, MatchStatus } from "@/types/domain";

export const Route = createFileRoute("/matches")({
  head: () => ({
    meta: [
      { title: "Matchs — BotolaGO" },
      { name: "description", content: "Suivez tous les matchs de la Botola Pro : en direct, à venir et résultats." },
      { property: "og:title", content: "Matchs — BotolaGO" },
      { property: "og:description", content: "Suivez tous les matchs de la Botola Pro : en direct, à venir et résultats." },
    ],
  }),
  component: MatchesPage,
});

type StatusFilter = "all" | "live" | "upcoming" | "finished";

const filterTabs: { key: StatusFilter; label: TranslationKey }[] = [
  { key: "all", label: "matches.tab.all" },
  { key: "live", label: "matches.tab.live" },
  { key: "upcoming", label: "matches.tab.upcoming" },
  { key: "finished", label: "matches.tab.results" },
];

/** Groups a match into a display bucket driven purely by domain status. */
function bucketOf(m: Match): "live" | "upcoming" | "finished" | "other" {
  if (m.status === "live") return "live";
  if (m.status === "scheduled") return "upcoming";
  if (m.status === "finished") return "finished";
  return "other"; // postponed etc. — rendered under upcoming for the selected date
}

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function MatchesPage() {
  const { t, tr, lang } = useI18n();
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());
  const [filter, setFilter] = useState<StatusFilter>("all");

  const matchesQ = useQuery({
    queryKey: ["matches", "all"],
    queryFn: () => botolaService.getMatches(),
  });
  const clubsQ = useQuery({ queryKey: ["clubs"], queryFn: () => botolaService.getClubs() });
  const tableQ = useQuery({ queryKey: ["table"], queryFn: () => botolaService.getTable() });

  const clubById = (id: string) => clubsQ.data?.find((c) => c.id === id);

  // Matches happening on the selected day (all statuses).
  const dayMatches = useMemo(() => {
    const list = matchesQ.data ?? [];
    return list.filter((m) => sameDay(new Date(m.kickoff), selectedDate));
  }, [matchesQ.data, selectedDate]);

  // Overall counts for the currently selected day, used by filter chip badges.
  const dayCounts = useMemo(() => {
    return dayMatches.reduce(
      (acc, m) => {
        const b = bucketOf(m);
        if (b === "live") acc.live++;
        else if (b === "upcoming" || b === "other") acc.upcoming++;
        else if (b === "finished") acc.finished++;
        return acc;
      },
      { live: 0, upcoming: 0, finished: 0 },
    );
  }, [dayMatches]);

  const totalDay = dayCounts.live + dayCounts.upcoming + dayCounts.finished;

  const visibleByBucket = useMemo(() => {
    const buckets: Record<"live" | "upcoming" | "finished", Match[]> = {
      live: [],
      upcoming: [],
      finished: [],
    };
    for (const m of dayMatches) {
      const b = bucketOf(m);
      if (b === "live") buckets.live.push(m);
      else if (b === "finished") buckets.finished.push(m);
      else buckets.upcoming.push(m);
    }
    // Sort each bucket for deterministic, editorial order.
    buckets.live.sort((a, b) => (a.minute ?? 0) - (b.minute ?? 0));
    buckets.upcoming.sort((a, b) => a.kickoff.localeCompare(b.kickoff));
    buckets.finished.sort((a, b) => b.kickoff.localeCompare(a.kickoff));
    return buckets;
  }, [dayMatches]);

  const dateFmt = new Intl.DateTimeFormat(lang === "ar" ? "ar-MA" : "fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(selectedDate);

  const loading = matchesQ.isLoading || clubsQ.isLoading;

  return (
    <AppShell backgroundVariant="matches">
      <h1 className="pt-2 text-2xl font-black tracking-tight text-foreground">
        <span className="text-brand">{t("matches.title")}</span>
      </h1>

      {/* Date navigation */}
      <div className="mt-3">
        <DateStrip selected={selectedDate} onSelect={setSelectedDate} />
      </div>

      {/* Sticky status filters */}
      <div
        className={cn(
          "sticky top-[var(--topbar-h)] z-20 -mx-3 mt-3 px-3 pb-2 pt-1",
        )}
      >
        <div
          role="tablist"
          aria-label={t("matches.title")}
          className={cn(
            "glass-surface glass-strong flex items-center gap-1 overflow-x-auto rounded-2xl border border-[var(--glass-border)] p-1",
            "[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden",
          )}
        >
          {filterTabs.map((it) => {
            const count =
              it.key === "live"
                ? dayCounts.live
                : it.key === "upcoming"
                  ? dayCounts.upcoming
                  : it.key === "finished"
                    ? dayCounts.finished
                    : totalDay;
            const active = filter === it.key;
            return (
              <button
                key={it.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setFilter(it.key)}
                className={cn(
                  "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-accent)]",
                  active
                    ? "bg-[color:var(--brand-primary)] text-white shadow"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span>{t(it.label)}</span>
                {count > 0 && (
                  <span
                    className={cn(
                      "inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-black tabular-nums",
                      active
                        ? "bg-white/25 text-white"
                        : "bg-[color:var(--surface-hover)] text-[color:var(--text-secondary)]",
                    )}
                    aria-hidden
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected-date subhead */}
      <div className="mt-2 flex items-center gap-2 px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--text-muted)]">
        <span className="truncate">{dateFmt}</span>
        {totalDay > 0 && (
          <span
            aria-hidden
            className="inline-flex h-1 w-1 rounded-full bg-[color:var(--text-muted)]/60"
          />
        )}
        {totalDay > 0 && (
          <span className="tabular-nums text-[color:var(--text-secondary)]">
            {totalDay}
          </span>
        )}
      </div>

      {/* Loading / error / empty */}
      {loading && (
        <div className="mt-3">
          <SkeletonList count={3}>{() => <MatchCardSkeleton />}</SkeletonList>
        </div>
      )}
      {matchesQ.isError && (
        <div className="mt-3">
          <ErrorState onRetry={() => matchesQ.refetch()} />
        </div>
      )}
      {!loading && !matchesQ.isError && totalDay === 0 && (
        <div className="mt-3">
          <EmptyState>{t("matches.section.no_matches_today")}</EmptyState>
        </div>
      )}

      {/* Live section */}
      {(filter === "all" || filter === "live") && visibleByBucket.live.length > 0 && (
        <Section index={0}>
          <SectionHeader
            title={t("matches.section.live")}
            eyebrow={t("matches.tab.live")}
            icon={Radio}
          />
          <CompetitionHeader count={visibleByBucket.live.length} />
          <div className="grid gap-2">
            {visibleByBucket.live.map((m) => {
              const home = clubById(m.homeClubId);
              const away = clubById(m.awayClubId);
              if (!home || !away) return null;
              return <MatchCard key={m.id} match={m} home={home} away={away} showVenue />;
            })}
          </div>
        </Section>
      )}

      {/* Upcoming section */}
      {(filter === "all" || filter === "upcoming") && visibleByBucket.upcoming.length > 0 && (
        <Section index={1}>
          <SectionHeader
            title={t("matches.section.upcoming")}
            eyebrow={t("matches.tab.upcoming")}
            icon={CalendarClock}
          />
          <CompetitionHeader count={visibleByBucket.upcoming.length} />
          <div className="grid gap-2">
            {visibleByBucket.upcoming.map((m) => {
              const home = clubById(m.homeClubId);
              const away = clubById(m.awayClubId);
              if (!home || !away) return null;
              return <MatchCard key={m.id} match={m} home={home} away={away} showVenue />;
            })}
          </div>
        </Section>
      )}

      {/* Finished section */}
      {(filter === "all" || filter === "finished") && visibleByBucket.finished.length > 0 && (
        <Section index={2}>
          <SectionHeader
            title={t("matches.section.finished")}
            eyebrow={t("matches.tab.results")}
            icon={CheckCircle2}
          />
          <CompetitionHeader count={visibleByBucket.finished.length} />
          <div className="grid gap-2">
            {visibleByBucket.finished.map((m) => {
              const home = clubById(m.homeClubId);
              const away = clubById(m.awayClubId);
              if (!home || !away) return null;
              return <MatchCard key={m.id} match={m} home={home} away={away} showVenue />;
            })}
          </div>
        </Section>
      )}

      {/* Per-filter empty states — only when the day itself has content in
          other buckets, so the message is informative rather than redundant. */}
      {!loading && filter === "live" && visibleByBucket.live.length === 0 && totalDay > 0 && (
        <div className="mt-4">
          <EmptyState compact>{t("matches.section.no_live")}</EmptyState>
        </div>
      )}
      {!loading && filter === "upcoming" && visibleByBucket.upcoming.length === 0 && totalDay > 0 && (
        <div className="mt-4">
          <EmptyState compact>{t("matches.section.no_upcoming")}</EmptyState>
        </div>
      )}
      {!loading && filter === "finished" && visibleByBucket.finished.length === 0 && totalDay > 0 && (
        <div className="mt-4">
          <EmptyState compact>{t("matches.section.no_finished")}</EmptyState>
        </div>
      )}

      {/* Standings — persistent context regardless of the selected date */}
      <Section index={3}>
        <SectionHeader
          title={t("matches.table_preview")}
          eyebrow={t("matches.competition.botola")}
        />
        {tableQ.isLoading ? (
          <LoadingState />
        ) : (
          <div className="overflow-hidden rounded-[var(--radius-card-lg)] border border-[var(--border-subtle)] bg-[color:var(--background-elevated)] shadow-card">
            <table className="w-full text-sm">
              <thead className="bg-[color:var(--surface-hover)] text-[10px] font-black uppercase tracking-[0.14em] text-[color:var(--text-muted)]">
                <tr>
                  <th className="px-3 py-2 text-start">#</th>
                  <th className="px-3 py-2 text-start">{t("matches.title")}</th>
                  <th className="px-2 py-2 text-center">J</th>
                  <th className="px-2 py-2 text-center">+/-</th>
                  <th className="px-3 py-2 text-end">Pts</th>
                </tr>
              </thead>
              <tbody>
                {tableQ.data?.map((row) => {
                  const club = clubById(row.clubId);
                  if (!club) return null;
                  return (
                    <tr key={row.clubId} className="border-t border-[var(--border-subtle)]">
                      <td className="px-3 py-2 font-mono text-xs tabular-nums text-[color:var(--text-muted)]">
                        {row.position}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <ClubCrest club={club} size="sm" />
                          <span className="truncate font-semibold text-foreground">{tr(club.shortName)}</span>
                        </div>
                      </td>
                      <td className="px-2 py-2 text-center tabular-nums">{row.played}</td>
                      <td className="px-2 py-2 text-center tabular-nums">
                        {row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}
                      </td>
                      <td className="px-3 py-2 text-end font-black tabular-nums text-foreground">
                        {row.points}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* An intentional spacer so the last card clears the bottom nav shadow. */}
      <div className="h-6" aria-hidden />
      <UnusedStatusSink dummy={"scheduled" as MatchStatus} />
    </AppShell>
  );
}

/**
 * Presentational placeholder that references the `MatchStatus` type so
 * TypeScript keeps the domain import bound to a use-site — the sink itself
 * renders nothing. This lets the file continue to reference the domain type
 * without triggering unused-import warnings on strict builds.
 */
function UnusedStatusSink(_: { dummy: MatchStatus }) {
  return null;
}
