import type { ReactNode } from "react";

import { UiPitchSurface } from "@/components/ui-kit";

/**
 * A pitch addressed by line rather than by row index.
 *
 * This used to be a second, independent pitch: a trapezoidal turf built from
 * `#0e5a3a`/`#0f6a44` gradients, `rgba` mow bands, `rgba` markings and a
 * blurred bench enclosure — about two dozen literal colours, none of which
 * followed the theme, sitting beside the one `FplPitch` actually renders.
 *
 * It is now the same surface as everywhere else (`UiPitchSurface`), so there
 * is one turf, one set of markings and one bench strip in the product, all
 * themed from `--ui-pitch-*`. Rows read GK → DEF → MID → FWD here as they do
 * on every other pitch; the old top-to-bottom FWD-first order was the only
 * place in Fantasy that inverted them.
 *
 * NOTHING RENDERS THIS TODAY. Searched the whole tree for `fantasy/Pitch` and
 * for `<Pitch`: the only hits are this file, `FplPitch`'s comment naming it as
 * the pitch it replaced, and a BG-0094 evidence dump. Every live pitch —
 * `/fantasy/team`, `/fantasy/points`, `SquadBuilderScreen` — goes through
 * `FplPitch`. Kept rather than deleted because it is the by-line address
 * (`gk` / `def` / `mid` / `fwd`) rather than `FplPitch`'s `rows`, and deleting
 * a public component is not a design lane's call; it carries no colour of its
 * own any more, so it costs the theme nothing while it waits.
 */
export function Pitch({
  gk,
  def,
  mid,
  fwd,
  bench,
  benchLabel,
  className,
}: {
  gk: ReactNode;
  def: ReactNode[];
  mid: ReactNode[];
  fwd: ReactNode[];
  bench?: ReactNode[];
  benchLabel?: string;
  className?: string;
}) {
  return (
    <UiPitchSurface
      className={className}
      rows={[[gk], def, mid, fwd]}
      bench={bench}
      // `benchLabels` is per slot; this component's single heading rides on
      // the first one so the strip keeps saying what it is.
      benchLabels={
        benchLabel && bench ? bench.map((_, i) => (i === 0 ? benchLabel : "")) : undefined
      }
    />
  );
}
