import { Link } from "@tanstack/react-router";
import type { Club, Match, MatchStatus } from "@/types/domain";
import { useI18n } from "@/i18n/provider";
import { ClubCrest } from "./ClubCrest";
import { LiveIndicator } from "@/components/matches/LiveIndicator";
import { cn } from "@/lib/utils";
import { MapPin } from "lucide-react";

/**
 * Design System V2 — Match card.
 *
 * A single, reusable match card that renders every supported match state
 * with a shared score-first structure but distinct visual identity:
 *   - `scheduled`             large kickoff time, teams equal, subtle chip
 *   - `live`                  pulsing LIVE + minute, bold score, ambient tint
 *   - `finished` (FT)         final score, calm chip
 *   - `postponed` / `delayed` / `cancelled`   status chip replaces score,
 *                              kickoff time is faded and struck-through where
 *                              appropriate
 *   - `penalties` / `extra_time` / `ht`       supported for future backend
 *                              data — the card renders these states cleanly
 *                              when the domain expands
 *
 * Behaviour:
 *   - The whole card is a router `<Link>` to `/matches/$matchId`; no data
 *     invention beyond fields already on `Match`.
 *   - RTL-safe: text alignment is logical (start / end); the physical
 *     layout stays consistent (home left, away right) which matches how
 *     match centers ship in both LTR and RTL products.
 *   - `aria-label` composes a screen-reader-friendly announcement so
 *     adjacent numeric scores are never ambiguous.
 *   - Score uses `tabular-nums` and monospace so 0–0 and 10–2 align.
 *
 * The public API is backwards compatible with all existing callers
 * (Home + Matches routes): `match / home / away / glass? / showVenue?`.
 * New optional `variant` allows a denser presentation on Home.
 */

type ExtendedStatus =
  | MatchStatus
  | "half_time"
  | "extra_time"
  | "penalties"
  | "cancelled"
  | "delayed";

export interface MatchCardExtras {
  /** Optional presentation-only status upgrades. Domain data still drives
   * the real status; components can pass an extended state when a richer
   * live feed is wired later. */
  displayStatus?: ExtendedStatus;
  /** Optional regulation-time score before penalty shootout (e.g. "1–1"). */
  aetScoreline?: string;
  /** Optional penalty shootout result rendered next to the main score. */
  penaltiesScore?: { home: number; away: number };
}

export function MatchCard({
  match,
  home,
  away,
  glass = true,
  showVenue = false,
  variant = "row",
  extras,
}: {
  match: Match;
  home: Club;
  away: Club;
  glass?: boolean;
  showVenue?: boolean;
  variant?: "row" | "compact";
  extras?: MatchCardExtras;
}) {
  const { t, tr, lang } = useI18n();
  const kickoff = new Date(match.kickoff);
  const locale = lang === "ar" ? "ar-MA" : "fr-FR";

  const status: ExtendedStatus = extras?.displayStatus ?? match.status;
  const isLive = status === "live" || status === "half_time" || status === "extra_time";
  const isFinished = status === "finished" || status === "penalties";
  const isScheduled = status === "scheduled" || status === "delayed";
  const isPostponed = status === "postponed" || status === "cancelled";

  const timeFmt = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(kickoff);
  const weekdayFmt = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "2-digit",
    month: "short",
  }).format(kickoff);

  const home_s = tr(home.shortName);
  const away_s = tr(away.shortName);
  const hs = match.homeScore ?? 0;
  const as = match.awayScore ?? 0;

  const a11yLabel = (() => {
    if (isFinished || isLive) {
      return t("matches.a11y.score")
        .replace("{home}", home_s)
        .replace("{hs}", String(hs))
        .replace("{away}", away_s)
        .replace("{as}", String(as));
    }
    if (isScheduled) {
      return `${home_s} ${t("matches.vs")} ${away_s} — ${t("matches.a11y.kickoff_at").replace("{time}", timeFmt)}`;
    }
    return `${home_s} ${t("matches.vs")} ${away_s} — ${t(`matches.a11y.status_${match.status}` as never) || t("matches.status.postponed")}`;
  })();

  // Status chip is intentionally minimal on scheduled/finished; only "live"
  // gets an emphatic treatment. Postponed/cancelled/delayed use a soft warn tone.
  const statusChip = (() => {
    if (isLive) {
      return <LiveIndicator minute={match.minute} />;
    }
    if (status === "finished") {
      return (
        <span className="inline-flex items-center rounded-full bg-[color:var(--surface-hover)] px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.14em] text-[color:var(--text-secondary)]">
          {t("matches.status.ft")}
        </span>
      );
    }
    if (status === "penalties") {
      return (
        <span className="inline-flex items-center rounded-full bg-[color:var(--surface-hover)] px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.14em] text-[color:var(--brand-primary)]">
          {t("matches.status.penalties")}
        </span>
      );
    }
    if (isPostponed) {
      return (
        <span
          className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.14em]"
          style={{
            background: "color-mix(in oklab, var(--color-warning) 14%, transparent)",
            color: "color-mix(in oklab, var(--color-warning) 60%, black)",
          }}
        >
          {status === "cancelled"
            ? t("matches.status.cancelled")
            : t("matches.status.postponed")}
        </span>
      );
    }
    if (status === "delayed") {
      return (
        <span
          className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.14em]"
          style={{
            background: "color-mix(in oklab, var(--color-warning) 14%, transparent)",
            color: "color-mix(in oklab, var(--color-warning) 60%, black)",
          }}
        >
          {t("matches.status.delayed")}
        </span>
      );
    }
    // scheduled → subtle day chip
    return (
      <span className="inline-flex items-center rounded-full bg-[color:var(--surface-hover)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--text-muted)]">
        {weekdayFmt}
      </span>
    );
  })();

  // Center column: score or kickoff time. Score always uses tabular numerics.
  const centerContent = (() => {
    if (isLive || isFinished) {
      return (
        <div className="flex flex-col items-center">
          <div
            className={cn(
              "flex items-baseline gap-1.5 font-mono font-black tabular-nums tracking-tight text-foreground",
              variant === "compact" ? "text-lg" : "text-[22px] sm:text-2xl",
            )}
          >
            <span aria-hidden>{hs}</span>
            <span aria-hidden className="text-[color:var(--text-muted)]">–</span>
            <span aria-hidden>{as}</span>
          </div>
          {status === "penalties" && extras?.penaltiesScore && (
            <div
              className="mt-0.5 text-[10px] font-black uppercase tabular-nums tracking-wider text-[color:var(--brand-primary)]"
              aria-hidden
            >
              {t("matches.penalty_shootout")} {extras.penaltiesScore.home}–{extras.penaltiesScore.away}
            </div>
          )}
          {status === "extra_time" && (
            <div className="mt-0.5 text-[9px] font-black uppercase tracking-wider text-[color:var(--color-live)]" aria-hidden>
              {t("matches.status.extra_time")}
            </div>
          )}
        </div>
      );
    }
    if (isPostponed) {
      return (
        <div className="flex flex-col items-center">
          <div
            className={cn(
              "font-mono text-sm font-semibold tabular-nums text-[color:var(--text-muted)] line-through decoration-[color:var(--text-muted)]/60",
            )}
            aria-hidden
          >
            {timeFmt}
          </div>
        </div>
      );
    }
    // scheduled / delayed → prominent kickoff time
    return (
      <div className="flex flex-col items-center">
        <div
          className={cn(
            "font-mono font-black tabular-nums text-foreground",
            variant === "compact" ? "text-lg" : "text-xl sm:text-[22px]",
          )}
          aria-hidden
        >
          {timeFmt}
        </div>
        <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[color:var(--text-muted)]" aria-hidden>
          {t("matches.kickoff")}
        </div>
      </div>
    );
  })();

  const surfaceClass = glass
    ? "surface-2-interactive"
    : "rounded-[var(--radius-card)] bg-card ring-1 ring-black/5";

  return (
    <Link
      to="/matches/$matchId"
      params={{ matchId: match.id }}
      aria-label={a11yLabel}
      className={cn(
        "group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-accent)]",
        surfaceClass,
        // Live cards get a very soft ambient tint on the trailing edge.
        isLive && "relative overflow-hidden",
      )}
    >
      {isLive && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            background:
              "linear-gradient(90deg, transparent 60%, color-mix(in oklab, var(--color-live) 8%, transparent) 100%)",
          }}
        />
      )}

      <div
        className={cn(
          "relative flex flex-col gap-1.5",
          variant === "compact" ? "px-3 py-2.5" : "px-3.5 py-3",
        )}
      >
        {/* Top row: status chip + gameweek */}
        <div className="flex items-center justify-between gap-2">
          {statusChip}
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--text-muted)] tabular-nums">
            {t("matches.gameweek")} {match.gameweek}
          </span>
        </div>

        {/* Main row: home | score/time | away */}
        <div className="flex items-center gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <ClubCrest club={home} size="sm" />
            <span
              className={cn(
                "truncate font-bold text-foreground",
                variant === "compact" ? "text-[13px]" : "text-sm",
              )}
            >
              {home_s}
            </span>
          </div>

          <div className="shrink-0 px-1.5">{centerContent}</div>

          <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
            <span
              className={cn(
                "truncate text-end font-bold text-foreground",
                variant === "compact" ? "text-[13px]" : "text-sm",
              )}
            >
              {away_s}
            </span>
            <ClubCrest club={away} size="sm" />
          </div>
        </div>

        {showVenue && (
          <div className="flex items-center gap-1 truncate text-[10px] text-[color:var(--text-muted)]">
            <MapPin className="h-3 w-3 shrink-0" aria-hidden />
            <span className="truncate">{tr(match.venue)}</span>
          </div>
        )}
      </div>
    </Link>
  );
}
