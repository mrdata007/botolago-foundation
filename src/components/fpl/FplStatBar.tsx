import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Transfers header strip from the reference: four columns with a small grey
 * caption above an ink value pill ("Free Transfers → Unlimited", "Wildcard →
 * Unavailable", "Cost → 0", "Bank → £6.1m").
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
      className={cn(
        "grid gap-2 border-b border-[color:var(--fpl-grey)] bg-white px-3 py-2",
        className,
      )}
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
    >
      {items.map((item, index) => (
        <div key={index} className="flex flex-col items-center gap-1 text-center">
          <span className="text-[11px] font-semibold text-[color:var(--fpl-grey-text)]">
            {item.label}
          </span>
          <span
            className={cn(
              "inline-flex min-h-6 w-full items-center justify-center rounded-[4px] px-1 text-[12px] font-extrabold",
              item.tone === "grey"
                ? "bg-[color:var(--fpl-grey)] text-[color:var(--fpl-grey-text)]"
                : "bg-[color:var(--fpl-ink)] text-[color:var(--fpl-cyan)]",
            )}
          >
            {item.value}
          </span>
        </div>
      ))}
    </div>
  );
}
