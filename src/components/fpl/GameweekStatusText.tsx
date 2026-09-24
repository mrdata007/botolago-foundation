import { getGameweekPresentation } from "@/components/fantasy/gameweek-presentation";
import { ui } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import type { FantasyGameweekStatus, FantasyPointsState } from "@/types/domain";

/**
 * A gameweek's state in words — "En direct", "Provisoire", "Définitive" —
 * with the breathing `--ui-live` dot while it is being scored.
 *
 * Whether it is "live" is `getGameweekPresentation`'s answer, not a second
 * opinion; the words are spelled out branch by branch rather than looked up
 * from `presentation.badgeKey`, because a key held in a variable is invisible
 * to the i18n gate's literal-key check (W4). The dot is decorative and still
 * under reduced motion (`live-breathe` is switched off globally); the word
 * carries the state. Colour is inherited, so it reads on a navy strip and on
 * a photo band alike.
 */
export function GameweekStatusText({
  status,
  pointsState = "provisional",
  className,
}: {
  status: FantasyGameweekStatus;
  pointsState?: FantasyPointsState;
  className?: string;
}) {
  const { t } = useI18n();
  const live = getGameweekPresentation(status, pointsState).tone === "live";
  const label =
    status === "scheduled"
      ? t("fantasy.gameweek.status.scheduled")
      : status === "open"
        ? t("fantasy.gameweek.status.open")
        : status === "locked"
          ? t("fantasy.gameweek.status.locked")
          : status === "live"
            ? t("fantasy.gameweek.status.live")
            : status === "provisional"
              ? t("fantasy.gameweek.status.provisional")
              : status === "finalizing"
                ? t("fantasy.gameweek.status.finalizing")
                : status === "cancelled"
                  ? t("fantasy.gameweek.status.cancelled")
                  : t("fantasy.gameweek.status.final");
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5", className)}>
      {live ? (
        <span
          aria-hidden
          className={cn(
            "live-breathe h-1.5 w-1.5 shrink-0 bg-[color:var(--ui-live)]",
            ui.radius.full,
          )}
        />
      ) : null}
      <span className="min-w-0 truncate">{label}</span>
    </span>
  );
}
