import { Link } from "@tanstack/react-router";
import { ClubCrest } from "@/components/common/ClubCrest";
import { Section } from "@/components/common/Section";
import { SectionHeader } from "@/components/common/SectionHeader";
import { SkeletonList, StandingsRowSkeleton } from "@/components/common/Skeletons";
import { EmptyState, ErrorState } from "@/components/common/States";
import { ui, UiCard, UiTable, UiTBody, UiTD, UiTH, UiTHead, UiTR } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { clubStyle, type ClubPalette } from "@/lib/club-palette";
import { sharedPositions } from "@/lib/league-table";
import { MATCH_TIME_ZONE } from "@/lib/match-kickoff";
import { cn } from "@/lib/utils";
import type { FootballSeason } from "@/services/football";
import type { Club, Match, TableRow } from "@/types/domain";
import {
  formatGoalDifference,
  meetingWinner,
  newestFirst,
  summariseHeadToHead,
} from "./head-to-head";
import { FormChips, StandingsNotes } from "./StandingsTable";

/**
 * The "Face à face" tab (A-H2H): where the two clubs stand, then how their
 * last meetings went. Where they stand is the season's table as the
 * Classement tab shows it (`getStandings`, read only while this tab is open),
 * with what that table cannot claim under it (`StandingsNotes`); the
 * meetings are the detail payload's (`headToHead`), nothing derived beyond
 * who won each one.
 *
 * Colours are the page's resolved pair by CLUB, not by side: the meetings
 * alternate venues, and Wydad must be Wydad's colour in every row whether it
 * was home or away that day.
 */
export function HeadToHead({
  home,
  away,
  palettes,
  standings,
  standingsComputed = false,
  seasonStatus,
  standingsPending = false,
  standingsFailed = false,
  onRetryStandings,
  meetings,
}: {
  home: Club;
  away: Club;
  palettes: { home: ClubPalette; away: ClubPalette };
  /** The season's whole table (`FootballStandings.overall`); empty before its first result. */
  standings: readonly TableRow[];
  /** `FootballStandings.computed`: the table is worked out from the results. */
  standingsComputed?: boolean;
  seasonStatus?: FootballSeason["status"];
  /** The table is still being read: its place is held, so the meetings do not jump. */
  standingsPending?: boolean;
  /**
   * The table could not be read. Said in its place, with a retry, as the
   * Classement tab says it: without a table the tab would look like a season
   * that has none yet.
   */
  standingsFailed?: boolean;
  onRetryStandings?: () => void;
  meetings: readonly Match[];
}) {
  const { t, tr } = useI18n();
  const clubOf = (id: string) => (id === home.id ? home : id === away.id ? away : undefined);
  const paletteOf = (id: string) => (id === home.id ? palettes.home : palettes.away);

  const rows =
    standingsPending || standingsFailed
      ? []
      : standings
          .filter((row) => row.clubId === home.id || row.clubId === away.id)
          .sort((a, b) => a.position - b.position);
  // Read from the whole table: a club can share its rank with clubs not shown.
  const shared = sharedPositions(standings);
  // Without a table section, the meetings open the tab, flush to its top.
  const tableSection = standingsPending || standingsFailed || rows.length > 0;

  return (
    <div>
      {standingsPending ? (
        <section aria-busy="true">
          <SectionHeader title={t("matches.detail.table_context")} />
          <SkeletonList count={2}>{() => <StandingsRowSkeleton />}</SkeletonList>
        </section>
      ) : standingsFailed ? (
        <section>
          <SectionHeader title={t("matches.detail.table_context")} />
          <ErrorState onRetry={onRetryStandings} />
        </section>
      ) : null}
      {rows.length > 0 && (
        <section>
          <SectionHeader title={t("matches.detail.table_context")} />
          <UiCard padding="none" className={cn("overflow-hidden", ui.radius.sheet)}>
            <UiTable caption={t("matches.detail.table_context")}>
              {/* Tight cells: five form chips, the points and the difference
                  leave the club name its width at 390px in both languages. */}
              <UiTHead>
                <tr>
                  <UiTH numeric className={FIRST_CELL}>
                    <span aria-hidden>#</span>
                    <span className="sr-only">{t("matches.table.rank")}</span>
                  </UiTH>
                  <UiTH className={CELL}>{t("matches.table.team")}</UiTH>
                  <UiTH numeric className={CELL}>
                    <span aria-hidden>{t("matches.table.points_short")}</span>
                    <span className="sr-only">{t("matches.table.points")}</span>
                  </UiTH>
                  <UiTH numeric className={CELL}>
                    <span aria-hidden>{t("matches.table.goal_difference_short")}</span>
                    <span className="sr-only">{t("matches.table.goal_difference")}</span>
                  </UiTH>
                  <UiTH numeric className={LAST_CELL}>
                    {t("matches.table.form")}
                  </UiTH>
                </tr>
              </UiTHead>
              <UiTBody>
                {rows.map((row) => {
                  const club = clubOf(row.clubId);
                  if (!club) return null;
                  const palette = paletteOf(row.clubId);
                  return (
                    <UiTR key={row.clubId} className="last:border-b-0">
                      {/* The club's edge bar on the row's inline start. */}
                      <UiTD
                        numeric
                        {...clubStyle(palette)}
                        className={cn(FIRST_CELL, ui.edge.start, ui.stat.md, ui.tone.default)}
                      >
                        {row.position}
                        {shared.has(row.position) ? (
                          <span className="sr-only">, {t("standings.shared_rank")}</span>
                        ) : null}
                      </UiTD>
                      <UiTD className={cn(CELL, "w-full max-w-0")}>
                        <span className="flex min-w-0 items-center gap-2">
                          <ClubCrest club={club} palette={palette} size="xs" />
                          <span
                            className={cn(
                              "truncate",
                              ui.text.secondary,
                              "[font-weight:var(--ui-weight-heavy)]",
                              ui.tone.default,
                            )}
                          >
                            {tr(club.name)}
                          </span>
                        </span>
                      </UiTD>
                      <UiTD numeric strong className={cn(CELL, ui.stat.md, ui.tone.default)}>
                        {row.points}
                      </UiTD>
                      <UiTD numeric className={cn(CELL, ui.tone.muted)}>
                        <bdi>{formatGoalDifference(row.goalDifference)}</bdi>
                      </UiTD>
                      <UiTD numeric className={LAST_CELL}>
                        <FormChips form={row.form} />
                      </UiTD>
                    </UiTR>
                  );
                })}
              </UiTBody>
            </UiTable>
          </UiCard>
          {/* A table worked out from the results, or a rank either club
              shares: said here as the Classement tab says it. */}
          <StandingsNotes
            rows={standings}
            shown={rows}
            computed={standingsComputed}
            seasonStatus={seasonStatus}
            className="mt-2"
          />
        </section>
      )}

      <Section className={cn(!tableSection && "mt-0 sm:mt-0")}>
        <SectionHeader title={t("matches.detail.head_to_head")} />
        {meetings.length === 0 ? (
          <EmptyState compact>{t("matches.detail.no_h2h")}</EmptyState>
        ) : (
          <UiCard padding="none" className={cn("overflow-hidden", ui.radius.sheet)}>
            <Summary home={home} away={away} palettes={palettes} meetings={meetings} />
            <ul>
              {newestFirst(meetings).map((meeting) => {
                const rowHome = clubOf(meeting.homeClubId);
                const rowAway = clubOf(meeting.awayClubId);
                if (!rowHome || !rowAway) return null;
                return (
                  <MeetingRow
                    key={meeting.id}
                    meeting={meeting}
                    home={rowHome}
                    away={rowAway}
                    homePalette={paletteOf(rowHome.id)}
                    awayPalette={paletteOf(rowAway.id)}
                  />
                );
              })}
            </ul>
          </UiCard>
        )}
      </Section>
    </div>
  );
}

const SEGMENT = "rounded-[var(--ui-radius-tight)] first:rounded-s-full last:rounded-e-full";

/** Table cell padding for the two-row standings table (the kit's is `px-2`). */
const CELL = "px-1.5";
const FIRST_CELL = "pe-1.5 ps-3";
const LAST_CELL = "pe-3 ps-1.5";

/** Wins, draws, wins — in the clubs' colours — and one bar split the same way. */
function Summary({
  home,
  away,
  palettes,
  meetings,
}: {
  home: Club;
  away: Club;
  palettes: { home: ClubPalette; away: ClubPalette };
  meetings: readonly Match[];
}) {
  const { t, tr, lang } = useI18n();
  const summary = summariseHeadToHead(meetings, home.id, away.id);
  if (summary.counted === 0) return null;
  const plural = new Intl.PluralRules(lang === "ar" ? "ar-MA" : "fr-FR");
  const winsOf = (club: Club, wins: number) =>
    (plural.select(wins) === "one"
      ? t("matches.detail.h2h_wins_one")
      : t("matches.detail.h2h_wins_other")
    ).replace("{club}", tr(club.shortName));
  const label = cn(ui.text.meta, "[font-weight:var(--ui-weight-strong)]", ui.tone.muted);

  return (
    <div className="px-4 pb-3.5 pt-3.5">
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-3">
        <p {...clubStyle(palettes.home)} className="flex min-w-0 flex-col items-start">
          <bdi className={cn(ui.score.lg, ui.tone.club)}>{summary.homeWins}</bdi>
          <span className={cn("max-w-full truncate", label)}>{winsOf(home, summary.homeWins)}</span>
        </p>
        <p className="flex flex-col items-center">
          <bdi className={cn(ui.score.lg, ui.tone.default)}>{summary.draws}</bdi>
          <span className={label}>{t("matches.table.drawn")}</span>
        </p>
        <p {...clubStyle(palettes.away)} className="flex min-w-0 flex-col items-end">
          <bdi className={cn(ui.score.lg, ui.tone.club)}>{summary.awayWins}</bdi>
          <span className={cn("max-w-full truncate", label)}>{winsOf(away, summary.awayWins)}</span>
        </p>
      </div>
      {/* The same three numbers as a shape; the figures above carry them.
          Outer ends round, inner seams tight — logical corners, so the
          home end is the right one in Arabic. */}
      <div aria-hidden className="mt-3 flex h-2.5 gap-0.5">
        {summary.homeWins > 0 && (
          <span
            data-club=""
            className={cn(SEGMENT, ui.club.fillOnly)}
            style={{ ...clubStyle(palettes.home).style, flex: `${summary.homeWins} 1 0` }}
          />
        )}
        {summary.draws > 0 && (
          <span
            className={cn(SEGMENT, "bg-[color:var(--ui-rule-strong)]")}
            style={{ flex: `${summary.draws} 1 0` }}
          />
        )}
        {summary.awayWins > 0 && (
          <span
            data-club=""
            className={cn(SEGMENT, ui.club.fillOnly)}
            style={{ ...clubStyle(palettes.away).style, flex: `${summary.awayWins} 1 0` }}
          />
        )}
      </div>
    </div>
  );
}

/**
 * One meeting: the date over the score, the winner in full weight and the
 * loser muted, each club's edge bar on its own end — 4px grid tracks, which
 * mirror in Arabic by themselves. Links to that match.
 */
function MeetingRow({
  meeting,
  home,
  away,
  homePalette,
  awayPalette,
}: {
  meeting: Match;
  home: Club;
  away: Club;
  homePalette: ClubPalette;
  awayPalette: ClubPalette;
}) {
  const { t, tr, lang } = useI18n();
  const date = new Intl.DateTimeFormat(lang === "ar" ? "ar-MA" : "fr-FR", {
    timeZone: MATCH_TIME_ZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(meeting.kickoff));
  const winner = meetingWinner(meeting);
  const hs = meeting.homeScore ?? 0;
  const as = meeting.awayScore ?? 0;
  const label = `${date} — ${t("matches.a11y.score")
    .replace("{home}", tr(home.shortName))
    .replace("{hs}", String(hs))
    .replace("{away}", tr(away.shortName))
    .replace("{as}", String(as))}`;
  // Two lines at most rather than an ellipsis: Arabic club names ("الوداد
  // الرياضي") are wider than half a 390px row.
  const name = (club: Club) =>
    cn(
      "line-clamp-2 min-w-0 break-words",
      ui.text.secondary,
      winner === club.id || winner === "draw"
        ? cn("[font-weight:var(--ui-weight-heavy)]", ui.tone.default)
        : cn("[font-weight:var(--ui-weight-strong)]", ui.tone.muted),
    );

  return (
    <li className={ui.rule.blockStart}>
      <Link
        to="/matches/$matchId"
        params={{ matchId: meeting.id }}
        aria-label={label}
        className={cn(
          "grid min-h-[var(--ui-row-min)] grid-cols-[0.25rem_minmax(0,1fr)_auto_minmax(0,1fr)_0.25rem] items-center gap-2",
          "transition-colors duration-[var(--duration-quick)] hover:bg-[color:var(--ui-surface-sunken)]",
          ui.focus,
          "focus-visible:ring-inset focus-visible:ring-offset-0",
        )}
      >
        <span {...clubStyle(homePalette)} className={cn("self-stretch", ui.club.edgeFill)} />
        <span className="flex min-w-0 items-center gap-2 py-2">
          <ClubCrest club={home} palette={homePalette} size="xs" />
          <span className={name(home)}>{tr(home.name)}</span>
        </span>
        <span className="flex flex-col items-center py-2">
          <span className={cn("whitespace-nowrap", ui.text.micro, ui.tone.muted)}>{date}</span>
          {/* Three flex children in a container that follows the page
              direction, so home is on the right in Arabic like its name. */}
          <span className={cn("flex items-center gap-1.5", ui.score.row, ui.tone.default)}>
            <bdi>{hs}</bdi>
            <span aria-hidden>–</span>
            <bdi>{as}</bdi>
          </span>
        </span>
        <span className="flex min-w-0 items-center justify-end gap-2 py-2 text-end">
          <span className={name(away)}>{tr(away.name)}</span>
          <ClubCrest club={away} palette={awayPalette} size="xs" />
        </span>
        <span {...clubStyle(awayPalette)} className={cn("self-stretch", ui.club.edgeFill)} />
      </Link>
    </li>
  );
}
