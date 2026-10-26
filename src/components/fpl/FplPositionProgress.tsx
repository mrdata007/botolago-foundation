import { Check } from "lucide-react";

import { ui } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import type { Position } from "@/types/fantasy";

export interface PositionProgress {
  position: Position;
  filled: number;
  required: number;
}

const ORDER: Position[] = ["GK", "DEF", "MID", "FWD"];

/** How many places of each position hold a player, from the slots as they stand. */
export function positionProgress(
  slots: ReadonlyArray<{ position: Position; player: unknown | null }>,
): PositionProgress[] {
  return ORDER.map((position) => {
    const mine = slots.filter((s) => s.position === position);
    return { position, filled: mine.filter((s) => s.player).length, required: mine.length };
  });
}

/**
 * "GB 1/2 · DEF 3/5 · MIL 3/5 · ATT 2/3", with "complet" or "reste N" under
 * each count, above the pitch. The first position still open is marked as the
 * next one to fill. Counts are read from the real squad, never kept apart.
 */
export function FplPositionProgress({
  items,
  className,
}: {
  items: PositionProgress[];
  className?: string;
}) {
  const { t } = useI18n();
  const label: Record<Position, string> = {
    GK: t("player.pos.GK"),
    DEF: t("player.pos.DEF"),
    MID: t("player.pos.MID"),
    FWD: t("player.pos.FWD"),
  };
  const nextPosition = items.find((item) => item.filled < item.required)?.position;
  return (
    <ul className={cn("grid grid-cols-4 gap-2", ui.space.gutter, className)}>
      {items.map((item) => {
        const done = item.filled >= item.required;
        const left = item.required - item.filled;
        const note = done
          ? t("fantasy.create.progress.done")
          : t("fantasy.create.progress.left").replace("{n}", String(left));
        return (
          <li
            key={item.position}
            data-position={item.position}
            data-done={done || undefined}
            className={cn(
              "flex min-h-[52px] min-w-0 flex-col items-center justify-center px-1 py-1.5",
              ui.radius.control,
              ui.surface.card,
              "border-[1.5px]",
              done
                ? "border-[color:var(--ui-positive)]"
                : item.position === nextPosition
                  ? "border-[color:var(--ui-ink-fg)]"
                  : "border-[color:var(--ui-rule-strong)]",
            )}
          >
            <span
              className={cn(
                "flex items-center gap-1",
                ui.text.meta,
                "[font-weight:var(--ui-weight-heavy)]",
                ui.tone.default,
              )}
            >
              {label[item.position]}{" "}
              <bdi dir="ltr" className={ui.text.tabular}>
                {item.filled}/{item.required}
              </bdi>
            </span>
            <span
              className={cn(
                "flex items-center gap-0.5",
                ui.text.micro,
                done ? ui.tone.positive : ui.tone.muted,
              )}
            >
              {done ? <Check className="h-3 w-3 shrink-0" aria-hidden /> : null}
              {note}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
