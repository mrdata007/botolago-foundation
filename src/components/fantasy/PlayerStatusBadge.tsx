import { useI18n } from "@/i18n/provider";
import type { Player } from "@/types/domain";
import type { TranslationKey } from "@/i18n/dictionaries";
import { cn } from "@/lib/utils";

const tone = {
  available: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30",
  injured: "bg-red-500/10 text-red-700 border-red-500/30",
  doubtful: "bg-amber-500/10 text-amber-800 border-amber-500/30",
  suspended: "bg-neutral-800/10 text-neutral-800 border-neutral-800/30",
  ineligible: "bg-red-500/10 text-red-800 border-red-500/30",
  unavailable: "bg-neutral-500/10 text-neutral-700 border-neutral-500/30",
} satisfies Record<Player["status"], string>;

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
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold",
        tone[status],
        className,
      )}
    >
      {t(`player.status.${status}` as TranslationKey)}
    </span>
  );
}
