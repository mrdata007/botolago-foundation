import { useEffect, useRef, useState } from "react";

import type { HistoryRowDto } from "@/backend/manager-card/contracts";
import { useI18n } from "@/i18n/provider";

import { HEIGHT, sparklinePoints } from "./sparkline-math";

/**
 * The line of the season (plan 4.6): the note after each evaluated journée, oldest to newest along
 * the reading direction (right to left in Arabic, like the rack above it and the table's
 * reading). 64px tall, one series, a 2px stroke in the brand foreground, no axis labels: the table
 * under it is the exact data and the way a screen reader gets it, so the drawing is `aria-hidden`.
 *
 * What it says honestly:
 *   - a journée with no note (the card was still forming) is a gap, never a zero;
 *   - a provisional note is a hollow point, the confirmed ones are the line itself;
 *   - fewer than two notes draw nothing (the sentence and the table already say it);
 *   - the latest note is a filled point with a 2px ring of the surface, so it stays a dot where
 *     it meets the line.
 * The scale runs between the season's lowest and highest note with a little room, because a
 * line of notes is read for its shape; the table has the figures.
 */
export function Sparkline({ rows }: { rows: readonly HistoryRowDto[] }) {
  const { lang } = useI18n();
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(320);
  useEffect(() => {
    const element = box.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const next = Math.round(entries[0]?.contentRect.width ?? 0);
      if (next > 0) setWidth(next);
    });
    observer.observe(element);
    setWidth(Math.round(element.getBoundingClientRect().width) || 320);
    return () => observer.disconnect();
  }, []);

  const { segments, points } = sparklinePoints(rows, width, lang === "ar");
  // One note is a point, not a line: the sentence above and the table say it, an empty frame does not.
  if (points.length < 2) return <div ref={box} className="w-full" aria-hidden />;
  return (
    <div ref={box} className="w-full" data-testid="curva-sparkline" aria-hidden>
      <svg
        width={width}
        height={HEIGHT}
        viewBox={`0 0 ${width} ${HEIGHT}`}
        className="block"
        focusable="false"
      >
        <line
          x1={0}
          x2={width}
          y1={HEIGHT - 0.5}
          y2={HEIGHT - 0.5}
          stroke="var(--ui-rule)"
          strokeWidth={1}
        />
        {segments.map((segment, index) =>
          segment.length > 1 ? (
            <polyline
              key={index}
              points={segment.map((p) => `${p.x},${p.y}`).join(" ")}
              fill="none"
              stroke="var(--ui-ink-fg)"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ) : null,
        )}
        {points.map((p, index) =>
          p.provisional ? (
            <circle
              key={index}
              cx={p.x}
              cy={p.y}
              r={4}
              fill="var(--ui-surface)"
              stroke="var(--ui-ink-fg)"
              strokeWidth={2}
            />
          ) : p.latest ? (
            <circle
              key={index}
              cx={p.x}
              cy={p.y}
              r={4}
              fill="var(--ui-ink-fg)"
              stroke="var(--ui-surface)"
              strokeWidth={2}
            />
          ) : null,
        )}
      </svg>
    </div>
  );
}
