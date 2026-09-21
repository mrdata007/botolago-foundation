import type { ReactNode } from "react";

import { ui } from "@/components/ui-kit";
import { cn } from "@/lib/utils";

/**
 * The squad-builder / transfers header strip: a small caption above a value
 * pill, repeated across four columns ("Transferts gratuits → Illimité",
 * "Wildcard → Indisponible", "Coût → 0", "Banque → 6.1").
 *
 * The values are figures a reader scans, so they use the stat ramp (tabular).
 * The captions used to be `whitespace-nowrap` at an off-ramp 10.5px, which
 * pushed a long French or Arabic caption straight out of its column; they now
 * wrap inside the column instead.
 */
export function FplStatBar({
  items,
  className,
}: {
  items: Array<{ label: ReactNode; value: ReactNode; tone?: "ink" | "grey" }>;
  className?: string;
}) {
  return (
    <div
      className={cn("grid gap-2 px-3 py-2", ui.surface.bar, ui.rule.block, className)}
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
    >
      {items.map((item, index) => (
        <div
          key={index}
          className="flex min-w-0 flex-col items-center justify-end gap-1 text-center"
        >
          <span className={cn("leading-tight", ui.text.micro, ui.tone.muted)}>{item.label}</span>
          <span
            className={cn(
              "inline-flex min-h-6 w-full items-center justify-center truncate px-1",
              ui.radius.tight,
              ui.stat.sm,
              item.tone === "grey"
                ? cn(ui.surface.sunken, ui.tone.muted)
                : cn(ui.surface.ink, ui.tone.onInk),
            )}
          >
            {item.value}
          </span>
        </div>
      ))}
    </div>
  );
}
