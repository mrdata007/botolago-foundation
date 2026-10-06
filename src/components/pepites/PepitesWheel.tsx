import { useId, type ReactNode } from "react";

import { ui } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

import { sectorPath, sliceAngles, sliceReach } from "./pepites-design";
import { COMPONENTS, componentLabel, formatNumber } from "./pepites-format";

/**
 * The five parts of the Rising score as the story card draws them
 * (`share-image.ts`, BG-0153), for the featured N°1 on the dark photo band.
 *
 * Five 72° slices from twelve o'clock, clockwise; in Arabic each slice is the
 * French one mirrored, so they run counter-clockwise from the right, like
 * the story card and like the legend's reading order (`sliceAngles`). Each
 * slice is filled from the inner ring outwards by the player's percentile
 * among the ranked U23s (`score.percentiles`, the five keys in `COMPONENTS`
 * order), in the action gradient over a Floodlight Navy track: progress is
 * the gradient's job (DESIGN.md, The Earned Gradient Rule), and the track
 * and the fill are made for the navy band, which is dark in both themes. An
 * unknown part is an empty slice.
 *
 * Geometry in a 100-unit box: the ring from radius 25 to 49.5 around the
 * centre, which holds `children` (the player's photo or the club crest, a
 * 56px disc). Decorative (`aria-hidden`): the legend prints every figure.
 */
const WHEEL = { c: 50, inner: 25, outer: 49.5 } as const;

export function PercentileWheel({
  percentiles,
  children,
  className,
}: {
  /** One per part, in `COMPONENTS` order; null when the part is unknown. */
  percentiles: readonly (number | null)[];
  /** The disc at the centre. */
  children?: ReactNode;
  /** Sets the size (`size-33 md:size-40`). */
  className?: string;
}) {
  const { lang } = useI18n();
  const rtl = lang === "ar";
  const gradient = useId();
  return (
    <div
      className={cn("relative grid shrink-0 place-items-center", className)}
      data-testid="pepites-wheel"
    >
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
        <defs>
          {/* Turf at the top, sky at the bottom, across the whole wheel. */}
          <linearGradient
            id={gradient}
            x1="0"
            y1="0"
            x2="0"
            y2="100"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0" style={{ stopColor: "var(--ui-accent-spring)" }} />
            <stop offset="1" style={{ stopColor: "var(--ui-accent-sky)" }} />
          </linearGradient>
        </defs>
        {COMPONENTS.map((key, index) => {
          const [from, to] = sliceAngles(index, rtl);
          const reach = sliceReach(percentiles[index], WHEEL.inner, WHEEL.outer);
          const value = sectorPath(WHEEL.c, WHEEL.c, WHEEL.inner, reach, from, to);
          return (
            <g key={key} data-slice={key}>
              <path
                d={sectorPath(WHEEL.c, WHEEL.c, WHEEL.inner, WHEEL.outer, from, to)}
                fill="var(--ui-ink)"
              />
              {value ? <path d={value} fill={`url(#${gradient})`} data-value="" /> : null}
            </g>
          );
        })}
      </svg>
      {children}
    </div>
  );
}

/**
 * A legend marker: a small wheel that shows where its part sits in the big
 * one, its own slice solid and the four others outlined (the story card's
 * markers), so the legend needs no colour key. On the band: solid in the
 * plain on-ink foreground, outlines in the muted one.
 */
function SliceMarker({ index }: { index: number }) {
  const { lang } = useI18n();
  const rtl = lang === "ar";
  const line = 0.7;
  return (
    <svg viewBox="0 0 12 12" className="size-3 shrink-0" aria-hidden>
      {COMPONENTS.map((key, other) => {
        const [from, to] = sliceAngles(other, rtl, 0.12);
        return other === index ? (
          <path key={key} d={sectorPath(6, 6, 2, 6, from, to)} fill="var(--ui-on-ink-plain)" />
        ) : (
          <path
            key={key}
            d={sectorPath(6, 6, 2 + line / 2, 6 - line / 2, from, to)}
            fill="none"
            stroke="var(--ui-on-ink-muted)"
            strokeWidth={line}
          />
        );
      })}
    </svg>
  );
}

/**
 * The wheel's legend, on the band: "Percentiles · vs les U23 classés", then
 * one row per part, its marker, its name and its percentile (a column of
 * figures, so the stat ramp). An unknown percentile prints a dash.
 *
 * The rows share one grid (each row a subgrid), as wide as its content: the
 * figures line up in a column right after the longest name, so on a wide
 * band a figure stays beside its name instead of at the band's far end.
 */
export function PercentileLegend({
  percentiles,
  className,
}: {
  percentiles: readonly (number | null)[];
  className?: string;
}) {
  const { t, lang } = useI18n();
  return (
    <div className={cn("flex min-w-0 flex-col gap-2", className)} data-testid="pepites-legend">
      <p className={cn(ui.text.label, ui.tone.onInkMuted)}>
        {t("pepites.player.percentiles")} · {t("pepites.player.percentiles_scope")}
      </p>
      <ul className="grid w-max max-w-full grid-cols-[auto_minmax(0,auto)_auto] items-center gap-x-2 gap-y-1.5">
        {COMPONENTS.map((key, index) => {
          const value = percentiles[index];
          return (
            <li key={key} className="col-span-3 grid grid-cols-subgrid items-center">
              <SliceMarker index={index} />
              <span className={cn("min-w-0 truncate", ui.text.meta, ui.tone.onInkMuted)}>
                {componentLabel(key, t)}
              </span>
              {/* Two digits' width at least past its gap, so a dash turning into a figure moves nothing. */}
              <bdi className={cn("min-w-9 ps-2 text-end", ui.stat.md, ui.tone.onInkPlain)}>
                {typeof value === "number" && Number.isFinite(value)
                  ? formatNumber(Math.round(value), lang)
                  : "–"}
              </bdi>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
