import type { ReactNode } from "react";

import { ui, UiPitchSurface } from "@/components/ui-kit";
import { cn } from "@/lib/utils";

/**
 * The Fantasy pitch.
 *
 * There used to be two pitches in this codebase — this one, drawn with a
 * literal `rgba(255,255,255,0.92)` for the markings and `--fpl-pitch-*` for
 * the turf, and `fantasy/Pitch.tsx`. Neither followed the theme. BG-0091
 * promoted the turf, the bench strip, the markings and the on-turf label
 * colour into the kit as `--ui-pitch-turf-a/-b`, `--ui-pitch-bench`,
 * `--ui-pitch-line` and `--ui-on-pitch`, each with a dark counterpart, and
 * gave the kit `UiPitchSurface` to draw them.
 *
 * So this is now an adapter, not a second implementation: one pitch, themed,
 * direction-neutral (the mowing bands run `to bottom`, so nothing mirrors
 * wrong under `dir="rtl"` — a row only reorders its peers).
 *
 * The props are unchanged on purpose. `/fantasy/team`, `/fantasy/points` and
 * `SquadBuilderScreen` (which is what `/fantasy/transfers` and
 * `/fantasy/create` render) all call it exactly as before.
 *
 * Option A (A-Team): the turf and the bench strip sit together in one card —
 * the feature radius (`--ui-radius-sheet`, the pitch is a feature surface),
 * the card shadow, clipped so the turf's corners follow the card's. The card
 * sits in the page gutter; `className` positions it.
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
  /** Bench Boost active: the bench strip gets the accent outline. */
  benchHighlighted?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden",
        ui.radius.sheet,
        ui.shadow.card,
        "bg-[color:var(--ui-pitch-bench)]",
        className,
      )}
    >
      <UiPitchSurface
        rows={rows}
        bench={bench}
        benchLabels={benchLabels}
        benchHighlighted={benchHighlighted}
      />
    </div>
  );
}
