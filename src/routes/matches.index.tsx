import standingsSoonArt from "@/assets/illustrations/standings-soon.webp";
import noMatchesArt from "@/assets/illustrations/empty-matches.webp";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { footballService, type FootballSeason } from "@/services/football";
import { AppShell } from "@/components/shell/AppShell";
import { MatchCard } from "@/components/common/MatchCard";
import { SectionHeader } from "@/components/common/SectionHeader";
import { Section } from "@/components/common/Section";
import { DateStrip } from "@/components/matches/DateStrip";
import { LiveStrip } from "@/components/matches/LiveStrip";
import { StandingsTable } from "@/components/matches/StandingsTable";
import { LoadingState, EmptyState, ErrorState } from "@/components/common/States";
import { MatchCardSkeleton } from "@/components/common/Skeletons";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ui, UiCard, UiChip, UiPageTitle } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import { isSameMatchDay, matchDayFromKey, matchDayKey, startOfMatchDay } from "@/lib/match-kickoff";
import { PUBLIC_SITE_ORIGIN } from "@/lib/article-meta";
import { matchRounds } from "@/lib/match-days";
import type { TranslationKey } from "@/i18n/dictionaries";
import type { Match } from "@/types/domain";

const MATCHES_TITLE = "Matches Botola Pro — scores en direct | BotolaGO";
const MATCHES_DESCRIPTION =
  "Suivez tous les matchs de la Botola Pro : scores en direct, calendrier, résultats et classement.";

export const Route = createFileRoute("/matches/")({
  head: () => ({
    meta: [
      { title: MATCHES_TITLE },
      { name: "description", content: MATCHES_DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:title", content: MATCHES_TITLE },
      { property: "og:description", content: MATCHES_DESCRIPTION },
      { property: "og:url", content: `${PUBLIC_SITE_ORIGIN}/matches` },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: MATCHES_TITLE },
      { name: "twitter:description", content: MATCHES_DESCRIPTION },
    ],
    links: [{ rel: "canonical", href: `${PUBLIC_SITE_ORIGIN}/matches` }],
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

/**
 * Day identity on this page is the competition's, not the viewer's
 * (BG-0100). The backend is already asked for a Casablanca day; filtering
 * the answer back through the browser's calendar is what made a 20:00
 * kickoff vanish from, or land on the wrong side of, the day the strip above
 * it was highlighting.
 */
const sameDay = isSameMatchDay;
const dateFromKey = matchDayFromKey;
const startOfDay = startOfMatchDay;

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

/**
 * Matches (Option A, A-Matches).
 *
 * Under the global bar, a white title band: "Matches" in the display face
 * with the season as a soft pill, then the live strip while anything is live,
 * then the status chips, which stick under the bar (and under the strip,
 * through `--livestrip-h`) as the page scrolls. The page itself opens on the
 * date band — the day, its round, the previous / next day — and lists that
 * day's matches as club-colour rows: live and upcoming together, then the
 * results. The standings close the page.
 *
 * The title band, the strip and the chips are the shell's `pageHeader`, so
 * all three run edge to edge and the chips can stick for the whole page: a
 * sticky element only sticks inside its parent, and the content column ends
 * where it does. The strip is rendered here, between the title and the
 * chips, rather than by `AppShell` after the whole header, so that on scroll
 * the strip sits directly under the bar and the chips directly under it.
 *
 * The board's "Botola Pro ▾" and "Tous les clubs ▾" chips are not drawn:
 * there is one competition, and no club filter behind the second.
 */
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
      matchDayKey(selectedDate),
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

  // Overall counts for the currently selected day, used by the filter chips.
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

  // The round(s) the day's matches belong to: the band names them, and a row
  // from another round carries its own "J. n" tag.
  const dayGameweeks = useMemo(() => matchRounds(dayMatches), [dayMatches]);
  const dayGameweek = dayGameweeks.length === 1 ? dayGameweeks[0] : undefined;

  // Live first, then what is still to come: one card of rows, as the board
  // stacks a match day. The results follow under their own heading.
  const fixtures = [
    ...(filter === "all" || filter === "live" ? visibleByBucket.live : []),
    ...(filter === "all" || filter === "upcoming" ? visibleByBucket.upcoming : []),
  ];
  const results = filter === "all" || filter === "finished" ? visibleByBucket.finished : [];

  const loading = seasonsQ.isLoading || !canLoadMatches || matchesQ.isLoading;

  const rows = (list: readonly Match[]) =>
    list.map((m) => {
      const home = clubById(m.homeClubId);
      const away = clubById(m.awayClubId);
      if (!home || !away) return null;
      return (
        <MatchCard
          key={m.id}
          match={m}
          home={home}
          away={away}
          variant="list"
          listGameweek={dayGameweek}
        />
      );
    });

  return (
    <AppShell
      backgroundVariant="matches"
      pageHeader={
        <>
          <UiPageTitle
            title={t("matches.title")}
            trailing={
              <SeasonPicker
                seasons={seasons}
                selected={selectedSeason}
                loading={seasonsQ.isLoading}
                onChange={handleSeasonChange}
                dir={dir}
              />
            }
            // One white band with the chips under it: no rule between them.
            className="border-b-0"
          />
          <LiveStrip />
          <StatusFilters value={filter} onChange={setFilter} liveCount={dayCounts.live} />
        </>
      }
    >
      {/* Date navigation, flush under the chips on a phone. */}
      <DateStrip
        selected={selectedDate}
        onSelect={handleDateChange}
        minDate={seasonBounds?.minDate}
        maxDate={seasonBounds?.maxDate}
        gameweeks={dayGameweeks}
        className="-mt-4 sm:mt-0"
      />

      {/* Loading / error / empty */}
      {loading && (
        <UiCard
          padding="none"
          className="mt-4 divide-y divide-[color:var(--ui-rule)] overflow-hidden"
        >
          <MatchCardSkeleton flat />
          <MatchCardSkeleton flat />
          <MatchCardSkeleton flat />
        </UiCard>
      )}
      {(seasonsQ.isError || matchesQ.isError) && (
        <div className="mt-4">
          <ErrorState
            onRetry={() => {
              void seasonsQ.refetch();
              if (seasonsQ.isSuccess) void matchesQ.refetch();
            }}
          />
        </div>
      )}
      {!loading && !seasonsQ.isError && !matchesQ.isError && totalDay === 0 && (
        <div className="mt-4">
          <EmptyState illustration={noMatchesArt}>
            {t("matches.section.no_matches_today")}
          </EmptyState>
        </div>
      )}

      {/* The day's live and upcoming matches. The card clips the rows' club
          edge bars to its corners. */}
      {!loading && fixtures.length > 0 && (
        <UiCard
          padding="none"
          className="mt-4 divide-y divide-[color:var(--ui-rule)] overflow-hidden"
        >
          {rows(fixtures)}
        </UiCard>
      )}

      {/* The day's results. */}
      {!loading && results.length > 0 && (
        <Section>
          <SectionHeader as="h3" title={t("matches.section.finished")} />
          <UiCard padding="none" className="divide-y divide-[color:var(--ui-rule)] overflow-hidden">
            {rows(results)}
          </UiCard>
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
      <Section>
        <SectionHeader
          title={t("matches.table_preview")}
          eyebrow={t("matches.competition.botola")}
        />
        {loading ? (
          <LoadingState />
        ) : seasonsQ.isError || matchesQ.isError ? null : (matchesQ.data?.standings.length ?? 0) ===
          0 ? (
          <EmptyState compact illustration={standingsSoonArt}>
            {t("matches.table.empty")}
          </EmptyState>
        ) : (
          <StandingsTable rows={matchesQ.data?.standings ?? []} clubById={clubById} />
        )}
      </Section>

      {/* An intentional spacer so the last card clears the bottom nav shadow. */}
      <div className="h-6" aria-hidden />
    </AppShell>
  );
}

/**
 * The status filters (Tous · En direct · À venir · Résultats) as Option A's
 * round chips, in a white band that sticks under the top bar — and under the
 * live strip while it shows, moving up with it when it slides away.
 *
 * The four chips share one line at every width. At 390px they fit as drawn;
 * narrower, each gives ground and its label truncates rather than the row
 * scrolling a filter off-screen with nothing to say it is there (BG-0111).
 * "En direct" carries the breathing dot and the day's live count while a
 * match is on, as the board draws it.
 */
function StatusFilters({
  value,
  onChange,
  liveCount,
}: {
  value: StatusFilter;
  onChange: (next: StatusFilter) => void;
  liveCount: number;
}) {
  const { t } = useI18n();
  return (
    <div
      className={cn(
        "sticky top-[calc(var(--topbar-h)+var(--livestrip-h))] z-20",
        "transition-[top] duration-[var(--duration-sheet)] ease-[var(--ease-standard)]",
        ui.surface.bar,
        ui.rule.block,
      )}
    >
      <div
        role="group"
        aria-label={t("matches.a11y.status_filters")}
        className={cn(
          "mx-auto flex min-w-0 items-center gap-1.5 pb-2.5 pt-1 max-[359px]:gap-1 md:max-w-[var(--ui-content-max)]",
          ui.space.gutter,
        )}
      >
        {filterTabs.map((it) => {
          const active = value === it.key;
          const live = it.key === "live" && liveCount > 0;
          return (
            <UiChip
              key={it.key}
              selected={active}
              onClick={() => onChange(it.key)}
              // Measured in French, the longest set: 348px of chips at 390
              // with the live count. Under 390 the count badge steps out
              // (the chip still says it, for assistive tech) and under 360
              // the chips tighten; shrinking with an ellipsis is only the
              // last resort, for text zoomed past all of that.
              className="min-w-0 shrink max-[359px]:px-2"
            >
              {live ? (
                <span
                  aria-hidden
                  className={cn(
                    "live-breathe h-2 w-2 shrink-0 bg-[color:var(--ui-live)]",
                    ui.radius.full,
                  )}
                />
              ) : null}
              <span className="min-w-0 truncate">{t(it.label)}</span>
              {live ? <span className="sr-only">{liveCount}</span> : null}
              {live ? (
                <span
                  aria-hidden
                  className={cn(
                    "inline-grid h-6 min-w-6 shrink-0 place-items-center px-1.5 max-[389px]:hidden",
                    ui.radius.full,
                    ui.text.micro,
                    "[font-weight:var(--ui-weight-heavy)]",
                    ui.text.tabular,
                    active
                      ? "bg-[color:var(--ui-surface)] text-[color:var(--ui-ink-fg)]"
                      : ui.surface.inkPlain,
                  )}
                >
                  {liveCount}
                </span>
              ) : null}
            </UiChip>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The season control beside the title: a soft round pill ("2026/2027 ⌄")
 * over the Radix select. The trigger renders the season label itself; left to
 * Radix it clones the whole selected item — label *and* "current" badge —
 * into the pill, where the badge was clipped at 390px (BG-0111).
 */
function SeasonPicker({
  seasons,
  selected,
  loading,
  onChange,
  dir,
}: {
  seasons: readonly FootballSeason[];
  selected: FootballSeason | undefined;
  loading: boolean;
  onChange: (seasonId: string) => void;
  dir: "ltr" | "rtl";
}) {
  const { t } = useI18n();
  return (
    <Select
      dir={dir}
      value={selected?.id ?? ""}
      onValueChange={onChange}
      disabled={seasons.length === 0}
    >
      <SelectTrigger
        aria-label={t("matches.season.label")}
        className={cn(
          "h-auto min-h-[var(--ui-tap-min)] w-auto gap-1.5 border-0 py-0 pe-3 ps-3.5 shadow-none",
          ui.radius.full,
          ui.surface.sunken,
          ui.text.meta,
          "[font-weight:var(--ui-weight-heavy)]",
          "[&>svg]:opacity-100",
          ui.focus,
        )}
      >
        <SelectValue
          placeholder={loading ? t("matches.season.loading") : t("matches.season.unavailable")}
        >
          {selected ? <span className={ui.text.tabular}>{selected.label}</span> : undefined}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className={cn(ui.radius.card, ui.rule.all, "bg-[color:var(--ui-surface)]")}>
        {seasons.map((season) => (
          <SelectItem
            key={season.id}
            value={season.id}
            className={cn("min-h-[var(--ui-tap-min)]", ui.radius.control)}
          >
            <span className="flex items-center gap-2">
              <span
                className={cn(
                  ui.text.body,
                  "[font-weight:var(--ui-weight-heavy)]",
                  ui.text.tabular,
                )}
              >
                {season.label}
              </span>
              {season.isCurrent && (
                <span
                  className={cn(
                    "inline-flex items-center px-2 py-0.5",
                    ui.radius.full,
                    ui.text.label,
                    ui.surface.sunken,
                    ui.tone.default,
                  )}
                >
                  {t("matches.season.current")}
                </span>
              )}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
