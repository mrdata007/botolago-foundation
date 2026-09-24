import type { CSSProperties } from "react";

import { ui } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import type { PointsBar } from "./points-chart";

/** The tallest bar, in px: the best week of the window. */
const PLOT_PX = 64;
/** A week that scored nothing still marks its place on the baseline. */
const STUB_PX = 2;

/**
 * The player's recent gameweeks as bars (A-Player "Dernières journées").
 *
 * Bars paint `--ui-club-edge`, the club colour stepped until it clears 3:1 on
 * the card, so a white or yellow kit is still a visible bar; put the chart
 * under the club's `clubStyle`. A provisional gameweek — scored, but not
 * final — is hatched with the club stripes at the "hatched bar" strength the
 * design system names (38%), and the legend says what the hatching means. It
 * is NOT drawn as live: provisional is a state of the points, not of a match.
 *
 * The grid mirrors in Arabic, so time runs right to left there, as the text
 * does. Each bar is a list item whose visible figures are hidden from
 * assistive tech and replaced by one sentence — gameweek, points, minutes,
 * opponent and state — which also carries the detail the bars do not draw.
 */
export function PointsChart({
  bars,
  label,
  className,
}: {
  bars: readonly PointsBar[];
  /** The list's accessible name. */
  label: string;
  className?: string;
}) {
  const { t, lang } = useI18n();
  const nf = new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-FR");
  const gameweek = (sequence: number) => `${t("fantasy.leagues.gw")}${nf.format(sequence)}`;
  const hatched = { "--stripe-alpha": "38%" } as CSSProperties;

  const describe = (bar: PointsBar) =>
    [
      gameweek(bar.sequence),
      `${nf.format(bar.points)} ${t("fantasy.points.abbr")}`,
      `${nf.format(bar.minutesPlayed)} ${t("home.minutes")}`,
      ...bar.opponents.map(
        (opponent) =>
          `${opponent.shortName} (${opponent.home ? t("common.home") : t("common.away")})`,
      ),
      bar.provisional ? t("fantasy.points.status.provisional") : null,
    ]
      .filter(Boolean)
      .join(", ");

  return (
    <div className={className}>
      <ol
        aria-label={label}
        className="grid"
        style={{ gridTemplateColumns: `repeat(${bars.length}, minmax(0, 1fr))` }}
      >
        {bars.map((bar) => {
          const height =
            bar.heightPct > 0 ? Math.max(3, Math.round((PLOT_PX * bar.heightPct) / 100)) : STUB_PX;
          return (
            <li key={bar.gameweekId} className="flex min-w-0 flex-col items-center">
              <span className="sr-only">{describe(bar)}</span>
              <span
                aria-hidden
                className={cn(
                  "flex w-full flex-col items-center justify-end gap-1",
                  "h-[calc(64px+1.75rem)]",
                  ui.rule.block,
                )}
              >
                <bdi className={cn(ui.stat.sm, ui.tone.default)}>{nf.format(bar.points)}</bdi>
                <span
                  className={cn(
                    "block w-7 rounded-t-[var(--ui-radius-control)]",
                    ui.club.edgeFill,
                    bar.provisional && ui.club.stripes,
                  )}
                  style={{ height: `${height}px`, ...(bar.provisional ? hatched : null) }}
                />
              </span>
              <span
                aria-hidden
                className={cn(
                  "mt-1.5 max-w-full truncate",
                  ui.text.micro,
                  bar.provisional
                    ? cn("[font-weight:var(--ui-weight-heavy)]", ui.tone.default)
                    : cn("[font-weight:var(--ui-weight-strong)]", ui.tone.muted),
                )}
              >
                <bdi>{gameweek(bar.sequence)}</bdi>
              </span>
            </li>
          );
        })}
      </ol>
      {bars.some((bar) => bar.provisional) ? (
        <p
          aria-hidden
          className={cn("mt-2 flex items-center gap-1.5", ui.text.micro, ui.tone.muted)}
        >
          <span
            className={cn(
              "h-3 w-3 shrink-0 rounded-[var(--ui-radius-tight)]",
              ui.club.edgeFill,
              ui.club.stripes,
            )}
            style={hatched}
          />
          {t("fantasy.points.status.provisional")}
        </p>
      ) : null}
    </div>
  );
}
