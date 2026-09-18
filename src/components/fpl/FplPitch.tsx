import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Pitch reconstructed from the FPL "Pick Team" / "Transfers" reference:
 * a flat light-green turf with alternating horizontal mowing bands, white
 * markings (goal + penalty box at the top, centre circle at the bottom),
 * four player rows and a lighter bench strip underneath with position
 * labels. RTL only reorders peers inside a row.
 */
export function FplPitch({
  rows,
  bench,
  benchLabels,
  benchHighlighted,
  className,
}: {
  /** GK → DEF → MID → FWD rows, each a list of player cards. */
  rows: ReactNode[][];
  bench?: ReactNode[];
  benchLabels?: string[];
  /** Bench Boost active: the bench strip gets the gradient outline. */
  benchHighlighted?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <div
        className="relative overflow-hidden"
        style={{
          background:
            "repeating-linear-gradient(180deg, var(--fpl-pitch-a) 0 60px, var(--fpl-pitch-b) 60px 120px)",
        }}
      >
        {/* Markings */}
        <svg
          aria-hidden
          viewBox="0 0 100 150"
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-0 h-full w-full"
        >
          <g fill="none" stroke="rgba(255,255,255,0.92)" strokeWidth="0.6">
            <rect x="3" y="0" width="94" height="150" />
            <rect x="20" y="0" width="60" height="20" />
            <rect x="35" y="0" width="30" height="7" />
            <path d="M 38 20 A 12 12 0 0 0 62 20" />
            <circle cx="50" cy="150" r="14" />
            <circle cx="50" cy="150" r="1" fill="rgba(255,255,255,0.92)" />
          </g>
          {/* Goal net */}
          <rect x="41" y="-1" width="18" height="4" fill="rgba(255,255,255,0.75)" />
        </svg>

        <div className="relative flex flex-col gap-3 px-1 pb-4 pt-3">
          {rows.map((row, index) => (
            <div key={index} className="flex items-start justify-evenly gap-1">
              {row.map((card, cardIndex) => (
                <div key={cardIndex} className="w-[76px] shrink-0 sm:w-[84px]">
                  {card}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {bench && bench.length > 0 ? (
        <div
          className={cn(
            "relative px-2 pb-3 pt-2",
            benchHighlighted &&
              "outline outline-2 -outline-offset-2 outline-[color:var(--fpl-cyan)]",
          )}
          style={{ background: "var(--fpl-pitch-bench)" }}
        >
          {benchLabels ? (
            <div className="mb-1 flex items-start justify-evenly gap-1">
              {benchLabels.map((label, index) => (
                <div
                  key={index}
                  className="w-[76px] shrink-0 text-center text-[12px] font-semibold text-[color:var(--fpl-ink-deep)] sm:w-[84px]"
                >
                  {label}
                </div>
              ))}
            </div>
          ) : null}
          <div className="flex items-start justify-evenly gap-1">
            {bench.map((card, index) => (
              <div key={index} className="w-[76px] shrink-0 sm:w-[84px]">
                {card}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
