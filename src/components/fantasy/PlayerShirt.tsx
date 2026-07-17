import type { FantasyPlayer } from "@/types/fantasy";
import type { Club } from "@/types/domain";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import type { TranslationKey } from "@/i18n/dictionaries";

interface Props {
  player: FantasyPlayer;
  club?: Club;
  metric?: string; // e.g., xPts / points value
  metricLabel?: string;
  captain?: boolean;
  vice?: boolean;
  onClick?: () => void;
  className?: string;
  showFixture?: boolean;
  nextOpponentClub?: Club;
  compact?: boolean;
}

export function PlayerShirt({
  player,
  club,
  metric,
  metricLabel,
  captain,
  vice,
  onClick,
  className,
  showFixture,
  nextOpponentClub,
  compact,
}: Props) {
  const { tr, t } = useI18n();
  const shortName = tr(player.name).split(" ").slice(-1)[0];
  const status = player.status;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative flex w-full flex-col items-center gap-1 rounded-xl px-1 py-1.5 text-center transition-transform focus-visible:outline-none motion-safe:hover:-translate-y-0.5",
        onClick && "cursor-pointer",
        className,
      )}
      aria-label={tr(player.name)}
    >
      <div className="relative">
        <div
          className="grid h-11 w-11 place-items-center rounded-lg text-[10px] font-black text-white shadow-md ring-1 ring-white/20"
          style={{
            background: club
              ? `linear-gradient(160deg, ${club.primaryColor} 0%, color-mix(in oklab, ${club.primaryColor} 55%, #000) 100%)`
              : "var(--bg-brand-gradient)",
          }}
          aria-hidden
        >
          {club?.crestPlaceholder ?? "?"}
        </div>
        {captain && (
          <span className="absolute -top-1 -end-1 grid h-4 w-4 place-items-center rounded-full bg-[color:var(--brand-accent)] text-[9px] font-black text-white ring-2 ring-white" aria-label={t("fantasy.captain_full")}>
            {t("fantasy.captain")}
          </span>
        )}
        {!captain && vice && (
          <span className="absolute -top-1 -end-1 grid h-4 w-4 place-items-center rounded-full bg-white text-[9px] font-black text-[color:var(--brand-primary)] ring-2 ring-[color:var(--brand-primary)]" aria-label={t("fantasy.vice_full")}>
            {t("fantasy.vice")}
          </span>
        )}
        {status !== "available" && (
          <span
            className={cn(
              "absolute -bottom-1 -start-1 grid h-3.5 w-3.5 place-items-center rounded-full text-[8px] font-black text-white ring-2 ring-white",
              status === "injured" && "bg-red-500",
              status === "doubtful" && "bg-amber-500",
              status === "suspended" && "bg-neutral-800",
            )}
            aria-label={t(`player.status.${status}` as TranslationKey)}
          >
            {status === "injured" ? "×" : status === "doubtful" ? "?" : "!"}
          </span>
        )}
      </div>
      <div className={cn("min-w-0 max-w-[68px] truncate text-[10px] font-bold text-foreground", compact && "max-w-[56px]")}>
        {shortName}
      </div>
      <div className="min-w-0 rounded bg-white/70 px-1.5 py-0.5 text-[10px] font-black tabular-nums text-foreground ring-1 ring-black/5">
        {metric ?? player.expectedPoints ?? "—"}
      </div>
      {showFixture && nextOpponentClub && (
        <div className="text-[9px] font-semibold text-muted-foreground">
          {nextOpponentClub.crestPlaceholder} {player.nextIsHome ? "(D)" : "(E)"}
        </div>
      )}
      {metricLabel && (
        <span className="sr-only">{metricLabel}</span>
      )}
    </button>
  );
}
