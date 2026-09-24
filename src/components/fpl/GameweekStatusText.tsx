import { ui } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import type { FantasyGameweekStatus } from "@/types/domain";

/**
 * A gameweek's state in words — "En direct", "Provisoire", "Définitive" —
 * with the breathing `--ui-live` dot while its matches are being played.
 *
 * The dot is for `live` alone. A `provisional` gameweek is still re-scored
 * (the presentation layer polls it and tones it "live"), but nothing is in
 * play, and the red dot says "in play" everywhere else in the product: the
 * live pill, the live strip, Points and its chart. The word carries
 * "Provisoire". The words are spelled out branch by branch rather than looked up
 * from `presentation.badgeKey`, because a key held in a variable is invisible
 * to the i18n gate's literal-key check (W4). The dot is decorative and still
 * under reduced motion (`live-breathe` is switched off globally); the word
 * carries the state. Colour is inherited, so it reads on a navy strip and on
 * a photo band alike.
 */
export function GameweekStatusText({
  status,
  className,
}: {
  status: FantasyGameweekStatus;
  className?: string;
}) {
  const { t } = useI18n();
  const live = status === "live";
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
