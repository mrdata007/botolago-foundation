import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

import { ui, UiCard, UiSkeleton } from "@/components/ui-kit";
import { matchCountLabel } from "@/components/matches/round-copy";
import { useI18n } from "@/i18n/provider";
import { capitalizeFirst } from "@/lib/match-days";
import {
  addMatchDays,
  isKickoffTimeUnconfirmed,
  matchDayFromKey,
  matchDayKey,
} from "@/lib/match-kickoff";
import { type RoundSummary } from "@/lib/match-round";
import { moroccoDateTimeFormat } from "@/lib/morocco-time";
import { cn } from "@/lib/utils";
import type { Match } from "@/types/domain";

/**
 * The round (journée) of the day on show, in one card: how many matches it
 * has, how many are played, live and still to come, how many of them are on
 * this day, when the next kick-off is, and, one press away, the whole round
 * day by day. From 1024px the page puts it beside the day's rows and the
 * round is always open there; on a phone it sits under the rows and opens on
 * demand.
 *
 * The figures are `summariseRound`'s: counts of matches that exist, so they add
 * up to the total and "dont N ce jour" is the number of rows that day lists.
 * Nothing here is a guess: no next kick-off is shown when none is known, and a
 * placeholder kick-off hour is left out rather than shown as 00:00.
 */
export function RoundSummaryCard({
  summary,
  today,
  renderRows,
  className,
}: {
  summary: RoundSummary;
  /** The page's today, a `YYYY-MM-DD` key: names "today" / "tomorrow" in the next kick-off. */
  today: string;
  /** The page's own rows for a list of matches (the same cards as the day's list). */
  renderRows: (matches: readonly Match[]) => ReactNode;
  className?: string;
}) {
  const { t, lang } = useI18n();
  const [open, setOpen] = useState(false);
  const headingId = useId();
  const listId = useId();
  const locale = lang === "ar" ? "ar-MA" : "fr-FR";

  const dayFmt = moroccoDateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long" });
  const shortFmt = moroccoDateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const timeFmt = moroccoDateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" });
  const tomorrow = matchDayKey(addMatchDays(matchDayFromKey(today), 1));

  const nextWhen = (match: Match): string => {
    const kickoff = new Date(match.kickoff);
    const key = matchDayKey(kickoff);
    const day =
      key === today
        ? t("matches.date.today")
        : key === tomorrow
          ? t("matches.date.tomorrow")
          : capitalizeFirst(shortFmt.format(kickoff));
    return isKickoffTimeUnconfirmed(match) ? day : `${day} · ${timeFmt.format(kickoff)}`;
  };

  const finished = summary.upcoming === 0 && summary.live === 0 && summary.total > 0;
  // The figures, loudest first: played, what is on this day, what is to come.
  // "Ce jour" is the rows the page lists for the day on show (a subset of the
  // other two, set apart by a rule); live and called off appear only when
  // there is one.
  const stats: { key: string; label: string; value: number; lit?: boolean }[] = [
    { key: "played", label: t("matches.round.played"), value: summary.played },
    ...(summary.live > 0
      ? [{ key: "live", label: t("matches.tab.live"), value: summary.live, lit: true }]
      : []),
    { key: "upcoming", label: t("matches.tab.upcoming"), value: summary.upcoming },
    ...(summary.calledOff > 0
      ? [{ key: "off", label: t("matches.round.called_off"), value: summary.calledOff }]
      : []),
  ];
  // The bar is the round told in a glance; the figures beside it are the
  // reading, so it is hidden from assistive tech.
  const share = (n: number) => (summary.total > 0 ? (n / summary.total) * 100 : 0);

  return (
    <div className={cn("min-w-0", className)}>
      {/* A navy band, like the date band above the rows: the round is the
          screen's second anchor. Changa figures, the action gradient only on
          the progress bar (an earned use). */}
      <section
        aria-labelledby={headingId}
        className={cn(
          "min-w-0 p-4",
          ui.radius.sheet,
          "bg-[color:var(--ui-ink-deep)]",
          ui.tone.onInkPlain,
        )}
      >
        <div className="flex min-w-0 items-baseline justify-between gap-3">
          <h2 id={headingId} className={cn("min-w-0 truncate", ui.display.section)}>
            {t("matches.round.title").replace("{n}", String(summary.round))}
          </h2>
          <p className={cn("shrink-0", ui.text.meta, ui.tone.onInkMuted)}>
            {matchCountLabel(summary.total, lang, t)}
          </p>
        </div>

        <dl className="mt-3 flex min-w-0 items-end gap-x-5">
          {stats.map((stat) => (
            <div key={stat.key} className="flex min-w-0 flex-col-reverse gap-1">
              <dt className={cn("truncate", ui.text.micro, ui.tone.onInkMuted)}>{stat.label}</dt>
              <dd className={cn(ui.score.lg, stat.lit && "text-[color:var(--ui-accent-spring)]")}>
                {stat.value}
              </dd>
            </div>
          ))}
          {summary.onDay > 0 ? (
            <div
              className={cn(
                "ms-auto flex min-w-0 flex-col-reverse gap-1 ps-5",
                "border-s border-[color:color-mix(in_oklab,var(--ui-on-ink-plain)_22%,transparent)]",
              )}
            >
              <dt className={cn("truncate", ui.text.micro, ui.tone.onInkMuted)}>
                {t("matches.round.on_day")}
              </dt>
              <dd className={cn(ui.score.lg, "text-[color:var(--ui-accent-spring)]")}>
                {summary.onDay}
              </dd>
            </div>
          ) : null}
        </dl>

        <div
          aria-hidden
          className={cn(
            "mt-4 flex h-2 w-full overflow-hidden",
            ui.radius.full,
            "bg-[color:color-mix(in_oklab,var(--ui-on-ink-plain)_18%,transparent)]",
          )}
        >
          <span
            className="h-full"
            style={{
              width: `${share(summary.played)}%`,
              backgroundImage: "var(--ui-grad-action)",
            }}
          />
          <span
            className="h-full bg-[color:var(--ui-live)]"
            style={{ width: `${share(summary.live)}%` }}
          />
        </div>

        <p className={cn("mt-3 min-h-[1.25rem]", ui.text.secondary)}>
          {summary.next ? (
            <>
              <span className={ui.tone.onInkMuted}>{t("matches.round.next")} </span>
              <span className={ui.text.bodyStrong}>{nextWhen(summary.next)}</span>
            </>
          ) : finished ? (
            <span className={ui.tone.onInkMuted}>{t("matches.round.complete")}</span>
          ) : null}
        </p>

        {summary.days.length + summary.undated.length > 0 ? (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={listId}
            onClick={() => setOpen((value) => !value)}
            className={cn(
              "mt-2 inline-flex min-h-[var(--ui-tap-min)] items-center gap-1.5 lg:hidden",
              ui.text.bodyStrong,
              ui.tone.onInkPlain,
              ui.focus,
            )}
          >
            {open ? t("matches.round.hide_all") : t("matches.round.show_all")}
            <ChevronDown
              className={cn("h-4 w-4 shrink-0 transition-transform", open && "rotate-180")}
              aria-hidden
            />
          </button>
        ) : null}
      </section>

      {summary.days.length + summary.undated.length > 0 ? (
        <div id={listId} className={cn(open ? "mt-4 block" : "hidden lg:mt-4 lg:block")}>
          <RoundDays
            days={summary.days}
            undated={summary.undated}
            label={(key) => capitalizeFirst(dayFmt.format(matchDayFromKey(key)))}
            renderRows={renderRows}
          />
        </div>
      ) : null}
    </div>
  );
}

/**
 * Matches grouped under their day: the day's name, then the same rows as the
 * day's list. A match with no confirmed date goes last, under "Date à
 * confirmer", never under a day it is not played on.
 */
export function RoundDays({
  days,
  undated,
  label,
  renderRows,
}: {
  days: readonly { key: string; matches: readonly Match[] }[];
  undated: readonly Match[];
  label: (dayKey: string) => string;
  renderRows: (matches: readonly Match[]) => ReactNode;
}) {
  const { t } = useI18n();
  return (
    <div className="grid min-w-0 gap-4">
      {days.map((day) => (
        <section key={day.key} className="min-w-0">
          <h3 className={cn("pb-1.5", ui.text.label, ui.tone.muted)}>{label(day.key)}</h3>
          <div
            className={cn(
              "divide-y divide-[color:var(--ui-rule)] overflow-hidden",
              ui.surface.card,
            )}
          >
            {renderRows(day.matches)}
          </div>
        </section>
      ))}
      {undated.length > 0 ? (
        <section className="min-w-0">
          <h3 className={cn("pb-1.5", ui.text.label, ui.tone.muted)}>
            {t("matches.kickoff_date_unconfirmed")}
          </h3>
          <div
            className={cn(
              "divide-y divide-[color:var(--ui-rule)] overflow-hidden",
              ui.surface.card,
            )}
          >
            {renderRows(undated)}
          </div>
        </section>
      ) : null}
    </div>
  );
}

/** The summary's place while the season's fixtures load: the card's height, no figures. */
export function RoundSummarySkeleton({ className }: { className?: string }) {
  return (
    <UiCard className={cn("min-w-0", className)} aria-hidden>
      <UiSkeleton className="h-5 w-28" />
      <UiSkeleton className="mt-2 h-3 w-40" />
      <UiSkeleton className="mt-4 h-2 w-full" />
      <UiSkeleton className="mt-4 h-8 w-48" />
    </UiCard>
  );
}
