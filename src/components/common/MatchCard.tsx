import type { Club, Match } from "@/types/domain";
import { useI18n } from "@/i18n/provider";
import { ClubCrest } from "./ClubCrest";
import { cn } from "@/lib/utils";

export function MatchCard({ match, home, away, glass = true, showVenue = false }: { match: Match; home: Club; away: Club; glass?: boolean; showVenue?: boolean }) {
  const { t, tr, lang } = useI18n();
  const isLive = match.status === "live";
  const isFinished = match.status === "finished";
  const kickoff = new Date(match.kickoff);
  const dateFmt = new Intl.DateTimeFormat(lang === "ar" ? "ar-MA" : "fr-FR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(kickoff);

  const scoreOrTime = isLive || isFinished ? `${match.homeScore ?? 0} – ${match.awayScore ?? 0}` : dateFmt;

  return (
    <div
      className={cn(
        "flex flex-col gap-1.5 rounded-2xl p-3",
        glass
          ? "glass-surface glass-regular border border-[var(--glass-border)]"
          : "bg-card ring-1 ring-black/5",
      )}
    >
      <div className="flex items-center gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <ClubCrest club={home} size="sm" />
          <span className="truncate text-sm font-bold text-foreground">{tr(home.shortName)}</span>
        </div>

        <div className="flex shrink-0 flex-col items-center px-2">
          <div className="flex items-center gap-1">
            {isLive && (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-1.5 py-0.5 text-[10px] font-bold text-red-600">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500 motion-reduce:animate-none" />
                {match.minute}'
              </span>
            )}
          </div>
          <div className={cn("mt-0.5 whitespace-nowrap font-mono text-sm font-black tabular-nums text-foreground", !isLive && !isFinished && "text-xs font-semibold text-muted-foreground")}>
            {scoreOrTime}
          </div>
          <div className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
            {t("matches.gameweek")}{match.gameweek}
          </div>
        </div>

        <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
          <span className="truncate text-end text-sm font-bold text-foreground">{tr(away.shortName)}</span>
          <ClubCrest club={away} size="sm" />
        </div>
      </div>
      {showVenue && (
        <div className="truncate text-[10px] text-muted-foreground">{tr(match.venue)}</div>
      )}
    </div>
  );
}
