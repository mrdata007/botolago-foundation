import type { Club, Match } from "@/types/domain";
import { useI18n } from "@/i18n/provider";
import { ClubCrest } from "./ClubCrest";
import { cn } from "@/lib/utils";

/**
 * Design System V2 — Match card.
 *
 * Score-first, compact, highly scannable. Live matches surface a pulsing
 * LIVE chip with the current minute; scheduled matches show localized
 * kickoff time; finished matches show final score with a subtle chip.
 *
 * Uses surface-2 (interactive) so pressing feels tactile, not decorative.
 * RTL-safe: everything uses logical alignment.
 */
export function MatchCard({
  match,
  home,
  away,
  glass = true,
  showVenue = false,
}: {
  match: Match;
  home: Club;
  away: Club;
  glass?: boolean;
  showVenue?: boolean;
}) {
  const { t, tr, lang } = useI18n();
  const isLive = match.status === "live";
  const isFinished = match.status === "finished";
  const kickoff = new Date(match.kickoff);

  const timeFmt = new Intl.DateTimeFormat(lang === "ar" ? "ar-MA" : "fr-FR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(kickoff);

  const scoreOrTime =
    isLive || isFinished ? `${match.homeScore ?? 0} – ${match.awayScore ?? 0}` : timeFmt;

  const statusChip = isLive ? (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider",
        "bg-[color:color-mix(in_oklab,var(--color-live)_14%,transparent)] text-[color:var(--color-live)]",
      )}
    >
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[color:var(--color-live)] motion-reduce:animate-none" />
      {t("matches.status.live")} {match.minute}'
    </span>
  ) : isFinished ? (
    <span className="inline-flex items-center rounded-full bg-[color:var(--surface-hover)] px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-[color:var(--text-secondary)]">
      {t("matches.status.finished")}
    </span>
  ) : null;

  return (
    <div
      className={cn(
        "flex flex-col gap-1.5 p-3",
        glass ? "surface-2-interactive" : "rounded-[var(--radius-card)] bg-card ring-1 ring-black/5",
      )}
    >
      <div className="flex items-center gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <ClubCrest club={home} size="sm" />
          <span className="truncate text-sm font-bold text-foreground">
            {tr(home.shortName)}
          </span>
        </div>

        <div className="flex shrink-0 flex-col items-center px-2">
          {statusChip}
          <div
            className={cn(
              "mt-0.5 whitespace-nowrap font-mono text-base font-black tabular-nums tracking-tight text-foreground",
              !isLive && !isFinished && "text-xs font-semibold text-[color:var(--text-muted)]",
            )}
          >
            {scoreOrTime}
          </div>
          <div className="mt-0.5 text-[10px] uppercase tracking-wide text-[color:var(--text-muted)]">
            {t("matches.gameweek")}
            {match.gameweek}
          </div>
        </div>

        <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
          <span className="truncate text-end text-sm font-bold text-foreground">
            {tr(away.shortName)}
          </span>
          <ClubCrest club={away} size="sm" />
        </div>
      </div>
      {showVenue && (
        <div className="truncate text-[10px] text-[color:var(--text-muted)]">
          {tr(match.venue)}
        </div>
      )}
    </div>
  );
}
