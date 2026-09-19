import { useI18n } from "@/i18n/provider";
import type { Player } from "@/types/domain";
import type { TranslationKey } from "@/i18n/dictionaries";
import { cn } from "@/lib/utils";

/**
 * Availability pill, ported onto the Fantasy `--fpl-*` tokens: pink for a
 * confirmed absence, amber for a doubt, ink/grey for a suspension — the same
 * palette `FplPlayerCard`'s availability glyph and `FplStateBadge` use.
 */
const tone: Record<Player["status"], string> = {
  available: "bg-[color:var(--fpl-grey)] text-[color:var(--fpl-grey-text)]",
  injured: "bg-[color:var(--fpl-pink)] text-white",
  doubtful: "bg-[color:var(--fpl-amber)] text-[color:var(--fpl-ink-deep)]",
  suspended: "bg-[color:var(--fpl-ink)] text-white",
};

export function PlayerStatusBadge({
  status,
  className,
}: {
  status: Player["status"];
  className?: string;
}) {
  const { t } = useI18n();
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide",
        tone[status],
        className,
      )}
    >
      {t(`player.status.${status}` as TranslationKey)}
    </span>
  );
}
