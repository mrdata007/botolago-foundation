import { MatchCard } from "@/components/common/MatchCard";
import { ui, UiCard } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { perMatch, type ClubSeasonStats, type RecordLine } from "@/lib/club-season";
import { cn } from "@/lib/utils";
import type { Club, Match } from "@/types/domain";

/**
 * A club's season in figures (A-Club, "Statistiques").
 *
 * The record and the goals are the season's official record (`record`: the
 * table's row when there is one); everything the table does not carry —
 * home and away, clean sheets, the biggest win — is counted from the
 * fixtures (`stats`). Figures are tabular (`ui.stat.*`), and every average
 * and rate is left out rather than printed as 0 when nothing has been played.
 */
export function ClubStats({
  record,
  stats,
  clubById,
}: {
  record: RecordLine;
  stats: ClubSeasonStats;
  clubById: (id: string) => Club | undefined;
}) {
  const { t, lang } = useI18n();
  const locale = lang === "ar" ? "ar-MA" : "fr-FR";
  const nf = new Intl.NumberFormat(locale);
  const decimal = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  const percent = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 });
  const scoredPerMatch = perMatch(record.goalsFor, record.played);
  const concededPerMatch = perMatch(record.goalsAgainst, record.played);
  const perMatchNote = (value: number | null) =>
    value === null ? undefined : t("club.stats.per_match").replace("{n}", decimal.format(value));

  return (
    <div className="grid gap-2.5">
      <div className="grid gap-2.5 sm:grid-cols-2">
        <UiCard padding="md">
          <h3 className={cn(ui.text.label, ui.tone.muted)}>{t("club.stats.record")}</h3>
          <dl className="mt-3 grid grid-cols-3">
            <Figure label={t("matches.table.won")} value={nf.format(record.won)} />
            <Figure label={t("matches.table.drawn")} value={nf.format(record.drawn)} divided />
            <Figure label={t("matches.table.lost")} value={nf.format(record.lost)} divided />
          </dl>
          <RecordBar record={record} />
        </UiCard>

        <UiCard padding="md">
          <h3 className={cn(ui.text.label, ui.tone.muted)}>{t("club.stats.goals")}</h3>
          <dl className="mt-3 grid grid-cols-2">
            <Figure
              label={t("club.stats.scored")}
              value={nf.format(record.goalsFor)}
              note={perMatchNote(scoredPerMatch)}
            />
            <Figure
              label={t("club.stats.conceded")}
              value={nf.format(record.goalsAgainst)}
              note={perMatchNote(concededPerMatch)}
              divided
            />
          </dl>
        </UiCard>
      </div>

      <UiCard padding="none" className="divide-y divide-[color:var(--ui-rule)]">
        {record.played > 0 ? (
          <StatLine
            label={t("club.stats.win_rate")}
            value={percent.format(record.won / record.played)}
          />
        ) : null}
        <StatLine label={t("club.stats.clean_sheets")} value={nf.format(stats.cleanSheets)} />
        <StatLine label={t("club.stats.failed_to_score")} value={nf.format(stats.failedToScore)} />
      </UiCard>

      {stats.home.played + stats.away.played > 0 ? (
        <HomeAwayTable home={stats.home} away={stats.away} />
      ) : null}

      {stats.biggestWin ? (
        <Extreme label={t("club.stats.biggest_win")} match={stats.biggestWin} clubById={clubById} />
      ) : null}
      {stats.heaviestDefeat ? (
        <Extreme
          label={t("club.stats.heaviest_defeat")}
          match={stats.heaviestDefeat}
          clubById={clubById}
        />
      ) : null}
    </div>
  );
}

/** A figure over its label (and an optional note), a hairline from its neighbour. */
function Figure({
  label,
  value,
  note,
  divided = false,
}: {
  label: string;
  value: string;
  note?: string;
  divided?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col-reverse items-center justify-end gap-0.5 px-1 text-center",
        divided && ui.rule.inline,
      )}
    >
      {/* Reversed so the label comes first for assistive tech, as a `dt`
          must, while the figure sits on top. The note is part of the `dd`. */}
      <dt className={cn("max-w-full text-balance", ui.text.label, ui.tone.muted)}>{label}</dt>
      <dd className="flex max-w-full flex-col items-center gap-0.5">
        <bdi className={cn("max-w-full truncate", ui.stat.lg, ui.tone.default)}>{value}</bdi>
        {note ? <span className={cn(ui.text.micro, ui.tone.muted)}>{note}</span> : null}
      </dd>
    </div>
  );
}

/**
 * Wins, draws and defeats as one bar, in proportion, from the inline start —
 * so it reads from the right in Arabic. Decorative: the figures above it say
 * the same thing.
 */
function RecordBar({ record }: { record: RecordLine }) {
  if (record.played === 0) return null;
  const segment = "basis-0";
  return (
    <div
      aria-hidden
      className={cn("mt-3.5 flex h-2 gap-0.5 overflow-hidden", ui.radius.full, ui.surface.sunken)}
    >
      {record.won > 0 ? (
        <span
          className={cn(segment, "bg-[color:var(--ui-positive)]")}
          style={{ flexGrow: record.won }}
        />
      ) : null}
      {record.drawn > 0 ? (
        <span
          className={cn(segment, "bg-[color:var(--ui-on-surface-faint)]")}
          style={{ flexGrow: record.drawn }}
        />
      ) : null}
      {record.lost > 0 ? (
        <span
          className={cn(segment, "bg-[color:var(--ui-negative)]")}
          style={{ flexGrow: record.lost }}
        />
      ) : null}
    </div>
  );
}

function StatLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-h-[var(--ui-row-min)] items-center justify-between gap-3 px-4 py-2">
      <span className={cn("min-w-0", ui.text.body, ui.tone.default)}>{label}</span>
      <bdi className={cn("shrink-0", ui.stat.md, ui.tone.default)}>{value}</bdi>
    </div>
  );
}

/**
 * Home and away side by side: played, won, drawn, lost and the goals, as
 * the table's own short headers write them.
 */
function HomeAwayTable({ home, away }: { home: RecordLine; away: RecordLine }) {
  const { t } = useI18n();
  const header = (short: string, full: string) => (
    <th scope="col" className="px-1 py-2 text-center">
      <span aria-hidden>{short}</span>
      <span className="sr-only">{full}</span>
    </th>
  );
  const line = (label: string, record: RecordLine) => (
    <tr className={ui.rule.blockStart}>
      <th
        scope="row"
        className={cn(
          "px-4 py-2.5 text-start",
          ui.text.body,
          "[font-weight:var(--ui-weight-strong)]",
          ui.tone.default,
        )}
      >
        {label}
      </th>
      <td className={cn("px-1 py-2.5 text-center", ui.stat.sm)}>{record.played}</td>
      <td className={cn("px-1 py-2.5 text-center", ui.stat.sm)}>{record.won}</td>
      <td className={cn("px-1 py-2.5 text-center", ui.stat.sm)}>{record.drawn}</td>
      <td className={cn("px-1 py-2.5 text-center", ui.stat.sm)}>{record.lost}</td>
      <td className={cn("px-4 py-2.5 text-end", ui.stat.sm)}>
        {/* For, then against, as three children that follow the page's
            direction: in Arabic "for" is on the right, where reading starts. */}
        <span className="inline-flex items-center gap-1">
          <bdi>{record.goalsFor}</bdi>
          <span aria-hidden>–</span>
          <bdi>{record.goalsAgainst}</bdi>
        </span>
      </td>
    </tr>
  );
  return (
    <UiCard padding="none" className="overflow-hidden">
      <table className={cn("w-full", ui.text.secondary)}>
        <caption className="sr-only">{t("club.stats.home_away")}</caption>
        <thead className={cn(ui.surface.sunken, ui.text.label, ui.tone.muted)}>
          <tr>
            <th scope="col" className="px-4 py-2 text-start">
              {t("club.stats.home_away")}
            </th>
            {header(t("matches.table.played_short"), t("matches.table.played"))}
            {header(t("matches.table.won_short"), t("matches.table.won"))}
            {header(t("matches.table.drawn_short"), t("matches.table.drawn"))}
            {header(t("matches.table.lost_short"), t("matches.table.lost"))}
            <th scope="col" className="px-4 py-2 text-end">
              {t("club.stats.goals")}
            </th>
          </tr>
        </thead>
        <tbody>
          {line(t("club.stats.home"), home)}
          {line(t("club.stats.away"), away)}
        </tbody>
      </table>
    </UiCard>
  );
}

/** The season's biggest win or heaviest defeat: its label, then the match. */
function Extreme({
  label,
  match,
  clubById,
}: {
  label: string;
  match: Match;
  clubById: (id: string) => Club | undefined;
}) {
  const home = clubById(match.homeClubId);
  const away = clubById(match.awayClubId);
  if (!home || !away) return null;
  return (
    <div className="min-w-0">
      <p className={cn("mb-1.5 mt-1", ui.text.label, ui.tone.muted)}>{label}</p>
      <MatchCard match={match} home={home} away={away} variant="compact" />
    </div>
  );
}
