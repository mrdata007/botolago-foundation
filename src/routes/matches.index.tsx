import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Radio, CalendarClock, CalendarRange, CheckCircle2 } from "lucide-react";
import { footballService, type FootballSeason } from "@/services/football";
import { AppShell } from "@/components/shell/AppShell";
import { MatchCard } from "@/components/common/MatchCard";
import { SectionHeader } from "@/components/common/SectionHeader";
import { Section } from "@/components/common/Section";
import { DateStrip } from "@/components/matches/DateStrip";
import { CompetitionHeader } from "@/components/matches/CompetitionHeader";
import { StandingsTable } from "@/components/matches/StandingsTable";
import { LoadingState, EmptyState, ErrorState } from "@/components/common/States";
import { MatchCardSkeleton, SkeletonList } from "@/components/common/Skeletons";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import type { TranslationKey } from "@/i18n/dictionaries";
import type { Match } from "@/types/domain";

export const Route = createFileRoute("/matches/")({
  head: () => ({
    meta: [
      { title: "Matchs — BotolaGO" },
      {
        name: "description",
        content: "Suivez tous les matchs de la Botola Pro : en direct, à venir et résultats.",
      },
      { property: "og:title", content: "Matchs — BotolaGO" },
      {
        property: "og:description",
        content: "Suivez tous les matchs de la Botola Pro : en direct, à venir et résultats.",
      },
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

const EMPTY_SEASONS: readonly FootballSeason[] = [];

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

function dateFromKey(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year!, month! - 1, day!);
}

function startOfDay(value: Date): Date {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function dateForSeason(season: FootballSeason): Date {
  const today = startOfDay(new Date());
  const startsOn = dateFromKey(season.startsOn);
  const endsOn = dateFromKey(season.endsOn);
  if (today >= startsOn && today <= endsOn) return today;
  if (today < startsOn) return dateFromKey(season.firstMatchDate ?? season.startsOn);
  return dateFromKey(season.lastMatchDate ?? season.endsOn);
}

function clampToSeason(date: Date, season: FootballSeason | undefined): Date {
  if (!season) return date;
  const day = startOfDay(date);
  const startsOn = dateFromKey(season.startsOn);
  const endsOn = dateFromKey(season.endsOn);
  if (day < startsOn) return startsOn;
  if (day > endsOn) return endsOn;
  return day;
}

function MatchesPage() {
  const { t, lang, dir } = useI18n();
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(null);
  const [filter, setFilter] = useState<StatusFilter>("all");

  const seasonsQ = useQuery({
    queryKey: ["football", "seasons", lang],
    queryFn: () => footballService.getSeasons(lang),
  });

  const seasons = seasonsQ.data ?? EMPTY_SEASONS;
  const selectedSeason = seasons.find((season) => season.id === selectedSeasonId);

  useEffect(() => {
    if (seasons.length === 0 || selectedSeason) return;
    const initialSeason = seasons.find((season) => season.isCurrent) ?? seasons[0]!;
    setSelectedSeasonId(initialSeason.id);
    setSelectedDate(dateForSeason(initialSeason));
  }, [seasons, selectedSeason]);

  const canLoadMatches = seasonsQ.isSuccess && (seasons.length === 0 || selectedSeason != null);

  const matchesQ = useQuery({
    queryKey: [
      "football",
      "matches",
      `${selectedDate.getFullYear()}-${selectedDate.getMonth() + 1}-${selectedDate.getDate()}`,
      selectedSeason?.id ?? "default",
      lang,
    ],
    queryFn: () => footballService.getMatchDay(selectedDate, lang, selectedSeason?.id),
    enabled: canLoadMatches,
  });

  const seasonBounds = useMemo(
    () =>
      selectedSeason
        ? {
            minDate: dateFromKey(selectedSeason.startsOn),
            maxDate: dateFromKey(selectedSeason.endsOn),
          }
        : undefined,
    [selectedSeason],
  );

  const handleSeasonChange = (seasonId: string) => {
    const season = seasons.find((item) => item.id === seasonId);
    if (!season) return;
    setSelectedSeasonId(season.id);
    setSelectedDate(dateForSeason(season));
    setFilter("all");
  };

  const handleDateChange = (date: Date) => {
    setSelectedDate(clampToSeason(date, selectedSeason));
  };

  const clubById = (id: string) => matchesQ.data?.clubs.find((club) => club.id === id);

  // Matches happening on the selected day (all statuses).
  const dayMatches = useMemo(() => {
    const list = matchesQ.data?.matches ?? [];
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

  const loading = seasonsQ.isLoading || !canLoadMatches || matchesQ.isLoading;

  return (
    <AppShell backgroundVariant="matches">
      <header className="flex items-end gap-3 pt-2">
        <h1 className="min-w-0 text-2xl font-black tracking-tight text-foreground">
          <span className="text-brand">{t("matches.title")}</span>
        </h1>

        <div className="ms-auto w-[10.5rem] shrink-0">
          <div className="mb-1 flex items-center gap-1.5 px-1 text-[10px] font-black uppercase tracking-[0.14em] text-[color:var(--text-muted)]">
            <CalendarRange className="h-3.5 w-3.5 text-[color:var(--brand-accent)]" aria-hidden />
            <span>{t("matches.season.label")}</span>
          </div>
          <Select
            dir={dir}
            value={selectedSeason?.id ?? ""}
            onValueChange={handleSeasonChange}
            disabled={seasons.length === 0}
          >
            <SelectTrigger
              aria-label={t("matches.season.label")}
              className={cn(
                "surface-3 h-11 rounded-xl border-[var(--glass-border)] px-3 font-bold shadow-none",
                "focus:ring-2 focus:ring-[color:var(--brand-accent)]",
              )}
            >
              <SelectValue
                placeholder={
                  seasonsQ.isLoading ? t("matches.season.loading") : t("matches.season.unavailable")
                }
              />
            </SelectTrigger>
            <SelectContent className="rounded-xl border-[var(--border-subtle)] bg-[color:var(--background-elevated)]">
              {seasons.map((season) => (
                <SelectItem key={season.id} value={season.id} className="min-h-11 rounded-lg">
                  <span className="flex items-center gap-2">
                    <span className="font-bold tabular-nums">{season.label}</span>
                    {season.isCurrent && (
                      <span className="rounded-full bg-[color:var(--surface-selected)] px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-[color:var(--brand-primary)]">
                        {t("matches.season.current")}
                      </span>
                    )}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </header>

      {/* Date navigation */}
      <div className="mt-3">
        <DateStrip
          selected={selectedDate}
          onSelect={handleDateChange}
          minDate={seasonBounds?.minDate}
          maxDate={seasonBounds?.maxDate}
        />
      </div>

      {/* Sticky status filters */}
      <div className={cn("sticky top-[var(--topbar-h)] z-20 -mx-3 mt-3 px-3 pb-2 pt-1")}>
        <div
          role="tablist"
          aria-label={t("matches.a11y.status_filters")}
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
          <span className="tabular-nums text-[color:var(--text-secondary)]">{totalDay}</span>
        )}
      </div>

      {/* Loading / error / empty */}
      {loading && (
        <div className="mt-3">
          <SkeletonList count={3}>{() => <MatchCardSkeleton />}</SkeletonList>
        </div>
      )}
      {(seasonsQ.isError || matchesQ.isError) && (
        <div className="mt-3">
          <ErrorState
            onRetry={() => {
              void seasonsQ.refetch();
              if (seasonsQ.isSuccess) void matchesQ.refetch();
            }}
          />
        </div>
      )}
      {!loading && !seasonsQ.isError && !matchesQ.isError && totalDay === 0 && (
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
      {!loading &&
        filter === "upcoming" &&
        visibleByBucket.upcoming.length === 0 &&
        totalDay > 0 && (
          <div className="mt-4">
            <EmptyState compact>{t("matches.section.no_upcoming")}</EmptyState>
          </div>
        )}
      {!loading &&
        filter === "finished" &&
        visibleByBucket.finished.length === 0 &&
        totalDay > 0 && (
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
        {loading ? (
          <LoadingState />
        ) : seasonsQ.isError || matchesQ.isError ? null : (matchesQ.data?.standings.length ?? 0) ===
          0 ? (
          <EmptyState compact>{t("matches.table.empty")}</EmptyState>
        ) : (
          <StandingsTable rows={matchesQ.data?.standings ?? []} clubById={clubById} />
        )}
      </Section>

      {/* An intentional spacer so the last card clears the bottom nav shadow. */}
      <div className="h-6" aria-hidden />
    </AppShell>
  );
}
