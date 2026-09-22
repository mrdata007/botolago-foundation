import { useI18n } from "@/i18n/provider";
import { Trophy } from "lucide-react";
import { ui } from "@/components/ui-kit";
import { cn } from "@/lib/utils";

/**
 * Design System V2 — Competition group header.
 *
 * Sits above each competition block on the Matches page. Visually distinct
 * but not dominant: a small monogram badge, competition name, and country
 * / category metadata. RTL-safe.
 *
 * Converted onto the kit's ramp (BG-0124). It carried three literal sizes
 * (13px, 10px, 10px) that were on no scale, `font-black` rather than a weight
 * token, and three legacy colour tokens. The literal that mattered was the
 * name: `truncate text-[13px]` with no leading gave a 23px box for 25px of
 * Arabic ink, so "البطولة الاحترافية إنوي" was cut on every Matches screen in
 * Arabic. `ui.text.meta` brings `--ui-leading-copy` with it, which is sized
 * per script.
 *
 * The 10px steps become `ui.text.label` (12px): the ramp has no 10px, and the
 * country line and the count are exactly what that step is for — uppercase,
 * tracked, secondary. One scale means a step it does not have is a step the
 * design does not get.
 */
export function CompetitionHeader({
  count,
  className,
}: {
  /** Number of matches under this group, shown as a subtle count. */
  count?: number;
  className?: string;
}) {
  const { t } = useI18n();
  return (
    <div className={cn("flex items-center gap-2.5 px-1 pb-2 pt-1", className)}>
      <div
        className="grid h-8 w-8 shrink-0 place-items-center rounded-[var(--ui-radius-control)] text-[color:var(--ui-ink-deep)] shadow-[var(--ui-shadow-card)]"
        style={{ backgroundImage: "var(--ui-grad-action)" }}
        aria-hidden
      >
        <Trophy className="h-4 w-4" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <div
          className={cn(
            "truncate",
            ui.text.meta,
            "[font-weight:var(--ui-weight-heavy)]",
            ui.tone.default,
          )}
        >
          {t("matches.competition.botola")}
        </div>
        <div className={cn("truncate", ui.text.label, ui.tone.muted)}>
          {t("matches.competition.country")}
        </div>
      </div>
      {typeof count === "number" && count > 0 && (
        <span
          className={cn(
            "inline-flex min-w-6 shrink-0 items-center justify-center px-2 py-0.5",
            ui.radius.full,
            ui.surface.sunken,
            ui.text.label,
            ui.text.tabular,
            ui.tone.muted,
          )}
          aria-hidden
        >
          {count}
        </span>
      )}
    </div>
  );
}
