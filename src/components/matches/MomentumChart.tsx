import { useI18n } from "@/i18n/provider";
import type { MatchEvent, MatchMomentumPoint } from "@/services/match-live";

/**
 * Momentum area chart (pure SVG, no chart dependency).
 *
 * The centre line is neutral: area above belongs to the home side, below to
 * the away side. Goals are pinned as markers on the timeline. The chart is
 * `aria-hidden` and paired with a text summary for assistive tech.
 */
export function MomentumChart({
  points,
  events,
  homeName,
  awayName,
}: {
  points: readonly MatchMomentumPoint[];
  events: readonly MatchEvent[];
  homeName: string;
  awayName: string;
}) {
  const { t, lang } = useI18n();

  if (points.length < 2) {
    return (
      <div className="rounded-[var(--radius-card-lg)] border border-dashed border-[var(--border-subtle)] bg-[color:var(--surface)]/40 px-4 py-8 text-center text-sm text-[color:var(--text-secondary)]">
        {t("matches.detail.no_stats")}
      </div>
    );
  }

  const W = 320;
  const H = 132;
  const mid = H / 2;
  const maxMinute = points[points.length - 1]!.minute || 1;
  const x = (m: number) => (m / maxMinute) * W;
  const y = (v: number) => mid - (v / 100) * (mid - 6);

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.minute)},${y(p.value)}`).join(" ");
  const area = `${line} L${W},${mid} L0,${mid} Z`;

  const homeShare = Math.round(
    (points.filter((p) => p.value > 0).length / points.length) * 100,
  );
  const summary = t("matches.detail.momentum_a11y")
    .replace("{home}", homeName)
    .replace("{homePct}", String(homeShare))
    .replace("{away}", awayName)
    .replace("{awayPct}", String(100 - homeShare));

  const goals = events.filter((e) => e.homeScore !== undefined);
  const nf = new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-FR");

  return (
    <div className="rounded-[var(--radius-card-lg)] border border-[var(--border-subtle)] bg-[color:var(--background-elevated)] p-4 shadow-card">
      <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-[0.14em]">
        <span className="truncate text-[color:var(--brand-primary)]">{homeName}</span>
        <span className="truncate text-[color:var(--text-muted)]">{awayName}</span>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-2 h-auto w-full"
        preserveAspectRatio="none"
        aria-hidden
        focusable="false"
      >
        <defs>
          <linearGradient id="momentum-fill" x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="0%"
              stopColor="var(--brand-primary)"
              stopOpacity="0.45"
            />
            <stop offset="50%" stopColor="var(--brand-primary)" stopOpacity="0.04" />
            <stop offset="100%" stopColor="var(--color-live)" stopOpacity="0.32" />
          </linearGradient>
        </defs>
        <line x1="0" y1={mid} x2={W} y2={mid} stroke="var(--border-subtle)" strokeWidth="1" />
        <path d={area} fill="url(#momentum-fill)" />
        <path
          d={line}
          fill="none"
          stroke="var(--brand-primary)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {goals.map((g) => (
          <g key={g.id}>
            <line
              x1={x(g.minute)}
              y1="4"
              x2={x(g.minute)}
              y2={H - 4}
              stroke="var(--brand-accent)"
              strokeWidth="1"
              strokeDasharray="3 3"
              opacity="0.55"
            />
            <circle
              cx={x(g.minute)}
              cy={g.side === "home" ? 8 : H - 8}
              r="4"
              fill="var(--brand-accent)"
            />
          </g>
        ))}
      </svg>

      <div className="mt-1 flex items-center justify-between text-[10px] font-semibold tabular-nums text-[color:var(--text-muted)]">
        <span>0′</span>
        <span>{nf.format(Math.round(maxMinute / 2))}′</span>
        <span>{nf.format(maxMinute)}′</span>
      </div>

      <p className="mt-3 text-xs text-[color:var(--text-secondary)]">{summary}</p>
    </div>
  );
}
