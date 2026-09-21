import { ui } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import type { Player } from "@/types/domain";
import type { TranslationKey } from "@/i18n/dictionaries";
import { cn } from "@/lib/utils";

/**
 * Availability pill, on the kit.
 *
 * Each state uses a pairing the design system already guarantees clears AA in
 * both themes: a caution fill carries `--ui-ink-deep`, an ink fill carries the
 * plain on-ink foreground, and "injured" is the negative *foreground* on a
 * tint of itself rather than a literal white on a mid-lightness pink.
 */
const tone: Record<Player["status"], string> = {
  available: cn(ui.surface.sunken, ui.tone.muted),
  injured:
    "bg-[color:color-mix(in_oklab,var(--ui-negative)_18%,transparent)] text-[color:var(--ui-negative)]",
  doubtful: "bg-[color:var(--ui-caution)] text-[color:var(--ui-ink-deep)]",
  suspended: ui.surface.inkPlain,
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
        "inline-flex items-center justify-center gap-1 px-2 py-0.5",
        ui.radius.full,
        // `ui.text.label` carries the `ltr:`-only tracking: Arabic letterforms
        // join and must never be letter-spaced (BG-0069).
        ui.text.label,
        tone[status],
        className,
      )}
    >
      {t(`player.status.${status}` as TranslationKey)}
    </span>
  );
}
