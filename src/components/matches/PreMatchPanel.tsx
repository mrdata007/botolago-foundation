import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { ClubCrest } from "@/components/common/ClubCrest";
import { useDeadlineCountdown } from "@/components/fpl/deadline";
import { ui } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { clubStyle, type ClubPalette } from "@/lib/club-palette";
import { isKickoffDateUnconfirmed, isKickoffTimeUnconfirmed } from "@/lib/match-kickoff";
import { presentScore } from "@/lib/match-score";
import { moroccoDateTimeFormat } from "@/lib/morocco-time";
import { cn } from "@/lib/utils";
import type { Club, Match, TableRow } from "@/types/domain";
import { meetingWinner } from "./head-to-head";
import { lastMeeting, standingOf } from "./pre-match";
import { FormChips } from "./StandingsTable";

/** The dash for a value the page does not have. Never a 0. */
const DASH = "—";

/**
 * "Avant-match": what the Résumé tab shows for a match still to be played, in
 * place of an empty "no key events" box.
 *
 * Built only from what the page already holds in the browser: the kick-off
 * (Morocco's clock, with a countdown), each club's place in the season table
 * and its last five results (the Face à face tab's table, same query), and the
 * last meeting of the two clubs (the match's head-to-head list). A value the
 * page does not have is a dash, a row with nothing to say is left out, and no
 * figure is made up. Nothing here needs a server query of its own.
 *
 * `standings` is `undefined` while the table is being read, when the read
 * failed, or for a competition with no league table; the clubs then show a
 * dash for their place and form.
 *
 * The countdown is read from the browser's clock after mount (`null` before),
 * so the server render and the first browser render agree.
 */
export function PreMatchPanel({
  match,
  home,
  away,
  palettes,
  meetings,
  standings,
}: {
  match: Match;
  home: Club;
  away: Club;
  palettes: { home: ClubPalette; away: ClubPalette };
  /** The detail's head-to-head list, any order. */
  meetings: readonly Match[];
  /** The season's whole table, when it is in hand. */
  standings?: readonly TableRow[];
}) {
  const { t, tr, lang } = useI18n();
  const locale = lang === "ar" ? "ar-MA" : "fr-FR";
  const dateUnconfirmed = isKickoffDateUnconfirmed(match);
  const timeUnconfirmed = isKickoffTimeUnconfirmed(match);
  const confirmed = !dateUnconfirmed && !timeUnconfirmed;
  const left = useDeadlineCountdown(confirmed ? match.kickoff : null);
  const time = moroccoDateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(
    new Date(match.kickoff),
  );
  const previous = lastMeeting(meetings, match.id);

  return (
    <section
      aria-labelledby="pre-match-title"
      className={cn("overflow-hidden", ui.radius.sheet, ui.shadow.lifted)}
    >
      {/* The stage: a navy band, the countdown the loudest thing on it. */}
      <div className={cn("px-4 pb-4 pt-3.5 text-center", ui.surface.inkPlain)}>
        <h2 id="pre-match-title" className={cn(ui.text.label, ui.tone.onInkMuted)}>
          {t("matches.pre.title")}
        </h2>
        {confirmed ? (
          <>
            <p className={cn("mt-2", ui.text.meta, ui.tone.onInkMuted)}>
              {t("matches.pre.starts_in")}
            </p>
            {/* Whole days, hours and minutes, each a big figure with its unit.
                Empty until the browser has read its own clock; the height is
                kept so nothing moves when it arrives. */}
            <p className="flex min-h-11 flex-wrap items-baseline justify-center gap-x-3">
              {left && !left.passed
                ? [
                    ...(left.days > 0 ? [{ n: left.days, unit: t("home.days") }] : []),
                    { n: left.hours, unit: t("home.hours") },
                    { n: left.minutes, unit: t("home.minutes") },
                  ].map(({ n, unit }) => (
                    <span key={unit} className="inline-flex items-baseline gap-1">
                      <bdi className={ui.score.lg}>{n}</bdi>
                      <span className={cn(ui.text.secondary, ui.tone.onInkMuted)}>{unit}</span>
                    </span>
                  ))
                : null}
            </p>
            <p className={cn("mt-1", ui.text.secondary, ui.tone.onInkPlain)}>
              {t("matches.pre.kickoff_at").replace("{time}", time)}
            </p>
          </>
        ) : (
          <p className={cn("mt-2", ui.score.md)}>
            {dateUnconfirmed
              ? t("matches.kickoff_date_unconfirmed")
              : t("matches.kickoff_unconfirmed")}
          </p>
        )}
      </div>

      {/* Each club in its own colour, as the match header is split: its place
          and points in the season table as big figures, its form under them. */}
      <ul className="grid grid-cols-2">
        {(
          [
            { club: home, palette: palettes.home },
            { club: away, palette: palettes.away },
          ] as const
        ).map(({ club, palette }) => {
          const row = standingOf(standings, club.id);
          return (
            <li
              key={club.id}
              {...clubStyle(palette)}
              className={cn("flex min-w-0 flex-col gap-2 px-4 py-4", ui.club.fill)}
            >
              <div className="flex min-w-0 items-center gap-2">
                <ClubCrest club={club} palette={palette} size="sm" tone="inverse" />
                <p
                  className={cn(
                    "min-w-0 truncate [font-weight:var(--ui-weight-heavy)]",
                    ui.text.secondary,
                  )}
                >
                  {tr(club.shortName)}
                </p>
              </div>
              <p className="flex flex-col">
                <bdi className={ui.score.lg}>{row ? row.position : DASH}</bdi>
                <span className={cn(ui.text.meta, "[font-weight:var(--ui-weight-strong)]")}>
                  {t("matches.pre.standing")}
                </span>
              </p>
              <p className={cn(ui.text.secondary, "[font-weight:var(--ui-weight-heavy)]")}>
                <bdi className={ui.text.tabular}>{row ? row.points : DASH}</bdi>{" "}
                <span aria-hidden>{t("matches.table.points_short")}</span>
                <span className="sr-only">{t("matches.table.points")}</span>
              </p>
              {/* The chips keep their own result colours, so they sit on a
                  plain pill rather than on the club fill. */}
              <span
                className={cn(
                  "inline-flex min-h-7 items-center self-start px-2 py-1",
                  ui.radius.full,
                  "bg-[color:var(--ui-surface)]",
                )}
              >
                <FormChips form={row?.form ?? []} />
              </span>
            </li>
          );
        })}
      </ul>
      <p className={cn("bg-[color:var(--ui-surface)] px-4 py-2.5", ui.text.micro, ui.tone.muted)}>
        {t("matches.pre.form_note")}
      </p>

      {/* The last meeting, with the way to the whole face-à-face. */}
      {previous ? (
        <LastMeeting meeting={previous} home={home} away={away} matchId={match.id} />
      ) : null}
    </section>
  );
}

function LastMeeting({
  meeting,
  home,
  away,
  matchId,
}: {
  meeting: Match;
  home: Club;
  away: Club;
  matchId: string;
}) {
  const { t, tr, lang } = useI18n();
  const rowHome =
    meeting.homeClubId === home.id ? home : meeting.homeClubId === away.id ? away : null;
  const rowAway =
    meeting.awayClubId === home.id ? home : meeting.awayClubId === away.id ? away : null;
  if (!rowHome || !rowAway) return null;
  const date = moroccoDateTimeFormat(lang === "ar" ? "ar-MA" : "fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(meeting.kickoff));
  const score = presentScore(meeting);
  const winner = meetingWinner(meeting);
  const name = (club: Club, end: boolean) =>
    cn(
      "min-w-0 truncate",
      end && "text-end",
      ui.text.secondary,
      winner === club.id || winner === "draw"
        ? cn("[font-weight:var(--ui-weight-heavy)]", ui.tone.default)
        : cn("[font-weight:var(--ui-weight-strong)]", ui.tone.muted),
    );

  return (
    <Link
      to="/matches/$matchId"
      params={{ matchId }}
      search={{ tab: "h2h" }}
      className={cn(
        "block bg-[color:var(--ui-surface)] px-4 py-3 transition-colors duration-[var(--duration-quick)] hover:bg-[color:var(--ui-surface-sunken)] active:bg-[color:var(--ui-surface-sunken)]",
        ui.rule.blockStart,
        ui.focus,
        "focus-visible:ring-inset focus-visible:ring-offset-0",
      )}
    >
      <p className={cn(ui.text.label, ui.tone.muted)}>
        {t("matches.pre.last_meeting")}
        <span className={cn("ms-2", ui.text.meta, "normal-case")}>
          <bdi>{date}</bdi>
        </span>
      </p>
      {/* Home first in the source, so Arabic puts it on the right. */}
      <p className="mt-1.5 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
        <span className={name(rowHome, true)}>{tr(rowHome.shortName)}</span>
        <span className={cn("flex items-center gap-1.5", ui.score.row, ui.tone.default)}>
          <bdi>{score.homeText}</bdi>
          <span aria-hidden>–</span>
          <bdi>{score.awayText}</bdi>
        </span>
        <span className={name(rowAway, false)}>{tr(rowAway.shortName)}</span>
      </p>
      <span className={cn("mt-2 inline-flex items-center gap-1", ui.text.meta, ui.tone.ink)}>
        {t("matches.pre.see_h2h")}
        <ChevronRight aria-hidden className="h-4 w-4" />
      </span>
    </Link>
  );
}
