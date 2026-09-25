import { ArticleCard } from "@/components/common/ArticleCard";
import { ClubCrest } from "@/components/common/ClubCrest";
import { MatchCard } from "@/components/common/MatchCard";
import { Section } from "@/components/common/Section";
import { SectionHeader, SectionHeaderLink } from "@/components/common/SectionHeader";
import {
  ArticleCardSkeleton,
  MatchCardSkeleton,
  SkeletonList,
} from "@/components/common/Skeletons";
import { EmptyState, ErrorState } from "@/components/common/States";
import { FormChips, StandingsNotes } from "@/components/matches/StandingsTable";
import { formatGoalDifference } from "@/components/matches/head-to-head";
import { ui, UiButton, UiCard } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import {
  clubResults,
  nextClubMatch,
  standingsAround,
  type ClubSeasonStats,
  type RecordLine,
} from "@/lib/club-season";
import { rowClubName } from "@/lib/club-identity";
import { clubStyle } from "@/lib/club-palette";
import { NEWS_ENABLED } from "@/lib/feature-flags";
import { cn } from "@/lib/utils";
import type { FootballSeason } from "@/services/football";
import type { Article, Club, Match, TableRow } from "@/types/domain";
import { Link } from "@tanstack/react-router";
import { ClubStats } from "./ClubStats";
import { STRETCHED_LINK } from "./stretched-link";

/** What a section needs to know about a request: nothing loaded yet, failed, or here. */
export interface SectionData<T> {
  readonly data: T | undefined;
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly refetch: () => unknown;
}

/**
 * A club page's first tab (A-Club, "Aperçu"): what a supporter opens the
 * page for, in the order they want it.
 *
 *   1. the next match — the one being played, else the next on the calendar
 *   2. the club's latest three stories (News is flagged: see below)
 *   3. the last three results, with the form of the last five beside them
 *   4. the season in figures (`ClubStats`)
 *   5. the table around the club, with the way to the whole table, and
 *      what it cannot claim (`StandingsNotes`) as the full table says it
 *
 * A section with nothing to say is left out rather than drawn empty — a
 * finished season has no next match — except the figures, whose absence
 * needs saying: before the first round they say the season has not started,
 * and offer the one before it.
 */
export function ClubOverview({
  club,
  matches,
  news,
  clubs,
  clubById,
  standings,
  standingsComputed,
  seasonStatus,
  stats,
  record,
  seasonLabel,
  seasonAbsent,
  previousSeason,
  standingsLink,
}: {
  club: Club;
  matches: SectionData<readonly Match[]>;
  /** The club's three latest stories. Read only while News is on. */
  news: SectionData<readonly Article[]>;
  /** Every club the page knows, for the article cards' colours. */
  clubs: readonly Club[];
  clubById: (id: string) => Club | undefined;
  standings: readonly TableRow[];
  /** `FootballStandings.computed`: the table is worked out from the results. */
  standingsComputed: boolean;
  seasonStatus: FootballSeason["status"] | undefined;
  stats: ClubSeasonStats;
  /** The season's record: the table's when there is a row, the fixtures' otherwise. */
  record: RecordLine;
  seasonLabel: string | undefined;
  /** The season is over and the club had no fixture in it: it was not in the league. */
  seasonAbsent: boolean;
  /** The latest earlier season the club has a result in, to offer while this one has none. */
  previousSeason: { label: string; onSelect: () => void } | undefined;
  /** Where "Classement complet" goes: this page's standings tab. */
  standingsLink: { to: string; params: Record<string, string>; search: Record<string, unknown> };
}) {
  const { t } = useI18n();
  const list = matches.data ?? [];
  const next = nextClubMatch(list);
  const results = clubResults(list, club.id).slice(0, 3);
  const around = standingsAround(standings, club.id);

  return (
    <>
      {/* 1. Next match */}
      {matches.isPending ? (
        <Section>
          <SectionHeader title={t("club.next_match")} />
          <MatchCardSkeleton />
        </Section>
      ) : next ? (
        <Section>
          <SectionHeader title={t("club.next_match")} />
          <MatchRow match={next} clubById={clubById} variant="row" />
        </Section>
      ) : null}

      {/* 2. News — hidden at launch (NEWS_ENABLED). Its fetch is gated on the
          same flag by the page, so with the flag off a club page makes no
          News request at all; the cards link to /news/$articleId, which
          redirects Home while the flag is off. */}
      {NEWS_ENABLED && (
        <Section>
          <SectionHeader title={t("news.title")} />
          {news.isPending ? (
            <SkeletonList count={3}>{() => <ArticleCardSkeleton />}</SkeletonList>
          ) : news.isError ? (
            <ErrorState onRetry={() => void news.refetch()} />
          ) : (news.data ?? []).length === 0 ? (
            <EmptyState compact>{t("club.news_empty")}</EmptyState>
          ) : (
            <div className="grid gap-2.5">
              {(news.data ?? []).map((article) => (
                <ArticleCard key={article.id} article={article} variant="compact" clubs={clubs} />
              ))}
            </div>
          )}
        </Section>
      )}

      {/* 3. Recent results and form */}
      {results.length > 0 && (
        <Section>
          <SectionHeader
            title={t("club.recent_results")}
            action={
              <span className="flex min-h-[var(--ui-tap-min)] items-center">
                <span className="sr-only">{t("matches.table.form")}</span>
                <FormChips form={stats.form} />
              </span>
            }
          />
          <UiCard padding="none" className="divide-y divide-[color:var(--ui-rule)] overflow-hidden">
            {results.map((match) => (
              <MatchRow key={match.id} match={match} clubById={clubById} variant="list" />
            ))}
          </UiCard>
        </Section>
      )}

      {/* 4. The season in figures */}
      <Section>
        <SectionHeader title={t("club.stats.title")} eyebrow={seasonLabel} />
        {matches.isPending ? (
          <SkeletonList count={2}>{() => <MatchCardSkeleton />}</SkeletonList>
        ) : matches.isError ? (
          <ErrorState onRetry={() => void matches.refetch()} />
        ) : record.played === 0 ? (
          <EmptyState compact>
            <span className="flex flex-col items-center gap-3">
              <span>{seasonAbsent ? t("club.season_absent") : t("club.season_empty")}</span>
              {previousSeason ? (
                <UiButton variant="ink" size="sm" onClick={previousSeason.onSelect}>
                  {t("club.view_season").replace("{season}", previousSeason.label)}
                </UiButton>
              ) : null}
            </span>
          </EmptyState>
        ) : (
          <ClubStats record={record} stats={stats} clubById={clubById} />
        )}
      </Section>

      {/* 5. The table around the club */}
      {around.length > 0 && (
        <Section>
          <SectionHeader
            title={t("matches.table_preview")}
            action={
              <SectionHeaderLink
                to={standingsLink.to}
                params={standingsLink.params}
                search={standingsLink.search}
              >
                {t("club.full_table")}
              </SectionHeaderLink>
            }
          />
          <UiCard padding="none" className="divide-y divide-[color:var(--ui-rule)] overflow-hidden">
            {around.map((tableRow) => (
              <MiniTableRow
                key={tableRow.clubId}
                row={tableRow}
                club={clubById(tableRow.clubId)}
                current={tableRow.clubId === club.id}
              />
            ))}
          </UiCard>
          <StandingsNotes
            rows={standings}
            shown={around}
            computed={standingsComputed}
            seasonStatus={seasonStatus}
            className="mt-2"
          />
        </Section>
      )}
    </>
  );
}

/** A match of this club's as a card row, once both clubs are known. */
function MatchRow({
  match,
  clubById,
  variant,
}: {
  match: Match;
  clubById: (id: string) => Club | undefined;
  variant: "row" | "list";
}) {
  const home = clubById(match.homeClubId);
  const away = clubById(match.awayClubId);
  if (!home || !away) return null;
  return <MatchCard match={match} home={home} away={away} variant={variant} />;
}

/**
 * One line of the table snapshot, as Home draws its snapshot — position,
 * crest, name, played, goal difference, points — with the club the page is
 * about marked by its tint and edge. Every other club opens its own page.
 */
function MiniTableRow({
  row,
  club,
  current,
}: {
  row: TableRow;
  club: Club | undefined;
  current: boolean;
}) {
  const { t, tr } = useI18n();
  if (!club) return null;
  const colours = current ? clubStyle(club) : undefined;
  const nameClass = cn(
    "min-w-0 flex-1 truncate",
    ui.text.body,
    "[font-weight:var(--ui-weight-heavy)]",
    ui.tone.default,
  );
  return (
    <div
      data-club={colours?.["data-club"]}
      style={colours?.style}
      aria-current={current ? "true" : undefined}
      className={cn(
        "relative flex min-h-[var(--ui-row-min)] items-center gap-2.5 px-3.5 py-2",
        current
          ? cn(ui.club.tint, ui.edge.start)
          : "transition-colors hover:bg-[color:var(--ui-surface-sunken)]",
      )}
    >
      <span
        className={cn(
          "w-5 shrink-0 text-center",
          ui.stat.sm,
          current ? ui.tone.default : ui.tone.muted,
        )}
        aria-hidden
      >
        {row.position}
      </span>
      <ClubCrest club={club} size="sm" />
      {current ? (
        <span className={nameClass}>{rowClubName(tr(club.shortName), tr(club.name))}</span>
      ) : (
        // The name is the link; its ::after makes the whole row the target.
        <Link
          to="/clubs/$clubId"
          params={{ clubId: club.id }}
          className={cn(nameClass, STRETCHED_LINK)}
        >
          {rowClubName(tr(club.shortName), tr(club.name))}
        </Link>
      )}
      <span
        className={cn("w-7 shrink-0 text-center", ui.stat.sm, ui.tone.muted)}
        aria-label={t("matches.table.played")}
      >
        {row.played}
      </span>
      <bdi
        className={cn("w-9 shrink-0 text-center", ui.stat.sm, ui.tone.muted)}
        aria-label={t("matches.table.goal_difference")}
      >
        {formatGoalDifference(row.goalDifference)}
      </bdi>
      <span
        className={cn("w-8 shrink-0 text-end", ui.stat.md, ui.tone.default)}
        aria-label={t("matches.table.points")}
      >
        {row.points}
      </span>
    </div>
  );
}
