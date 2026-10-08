import type { CSSProperties, ReactNode } from "react";

import { ManagerCard } from "@/components/manager-card/ManagerCard";
import { useCardCopy } from "@/components/manager-card/copy";
import type { BeatName, CardProfile, TierCode } from "@/components/manager-card/types";
import { ui } from "@/components/ui-kit";
import { cn } from "@/lib/utils";

import { Figure, ProvisionalBadge } from "./figures";

/**
 * Where the card hangs (plan section 4.0). The scarf is folded over the barrier rail of the
 * stands, so the stage draws that rail: a 6px rounded line across the whole column at the height
 * of the card's own steel rail, the card in front of it. The card is the one expressive object on
 * the page; the line is what makes it hang somewhere instead of floating.
 *
 * Full cards are 240px wide on phones and 264px from 768px, centred; the column grows with the
 * card's height (a HOMA, an Arabic name, a long name are taller), so nothing is clipped.
 *
 * The rail's height follows the card's width, through a container query unit, so it stays on the
 * card's rail at both widths: the hanging cards' steel rail is centred 15 of 264 units from their
 * top (the renderer's viewBox). LEGEND's raised scarf has no rail to hang from; it gets none.
 */
const RAIL_CENTRE = 15 / 264;

export function CardStage({
  profile,
  beat,
  children,
  className,
  testId = "gradins-stage",
}: {
  profile: CardProfile;
  beat?: BeatName;
  /** The rating line and what follows it, centred under the card. */
  children?: ReactNode;
  className?: string;
  testId?: string;
}) {
  const hangs = profile.tier !== "legend";
  return (
    <section
      className={cn("relative overflow-x-clip pb-1 pt-5 md:pt-6", className)}
      data-stage={profile.tier ?? "base"}
    >
      <div
        data-stage-card=""
        className="relative mx-auto w-60 [container-type:inline-size] md:w-[264px]"
      >
        {hangs ? (
          <span
            aria-hidden
            data-stage-rail=""
            className="pointer-events-none absolute z-0 h-1.5 rounded-full bg-[color:var(--ui-rule-strong)]"
            style={
              {
                insetInline: "-50vw",
                top: `calc(${(RAIL_CENTRE * 100).toFixed(3)}cqw - 3px)`,
              } as CSSProperties
            }
          />
        ) : null}
        <ManagerCard
          profile={profile}
          width={264}
          beat={beat}
          sway
          testId={testId}
          className="relative z-10"
        />
      </div>
      {children ? (
        <div className="mt-3 flex flex-col items-center gap-1 px-4">{children}</div>
      ) : null}
    </section>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* The rating line                                                                              */
/* ------------------------------------------------------------------------------------------ */

/**
 * Under the card, in text, always: « 84 OVR · PRO » and the « Provisoire » pill, or, while the card
 * is forming, « Carte en formation · 1/3 ». Ordinary DOM, so the number is on screen the moment
 * the data is, before the renderer's chunk has loaded. A new season that has no number of its own
 * yet shows last season's, with that season's label beside it.
 */
export function RatingLine({
  ovr,
  tier,
  provisional,
  counted,
  min,
  season,
  formingLabel,
}: {
  ovr: number | null;
  tier: TierCode | null;
  provisional: boolean;
  counted: number;
  min: number;
  /** The season the number belongs to, shown when it is not the current one. */
  season?: string | null;
  formingLabel: string;
}) {
  const copy = useCardCopy();
  if (ovr === null) {
    return (
      <p
        className="flex flex-wrap items-baseline justify-center gap-x-2 gap-y-1"
        data-testid="gradins-rating-line"
      >
        <span className={cn(ui.display.team, ui.tone.default)}>{formingLabel}</span>
        <span aria-hidden className={cn(ui.display.team, ui.tone.muted)}>
          ·
        </span>
        <span className={cn(ui.score.md, ui.tone.default)}>
          <span aria-hidden>
            <Figure>{counted}</Figure>/<Figure>{min}</Figure>
          </span>
          <span className="sr-only">{copy.countedA11y(counted, min)}</span>
        </span>
      </p>
    );
  }
  return (
    <p
      className="flex flex-wrap items-baseline justify-center gap-x-2 gap-y-1"
      data-testid="gradins-rating-line"
    >
      <span className={cn(ui.score.md, ui.tone.default)}>
        <Figure>{ovr}</Figure>
      </span>
      <span className={cn(ui.text.meta, "[font-weight:var(--ui-weight-heavy)]", ui.tone.muted)}>
        {copy.ovr}
      </span>
      {tier ? (
        <>
          <span aria-hidden className={cn(ui.display.team, ui.tone.muted)}>
            ·
          </span>
          <span className={cn(ui.display.team, ui.tone.default)}>{copy.tier[tier]}</span>
        </>
      ) : null}
      {season ? (
        <span className={cn(ui.text.meta, ui.tone.muted)}>
          <Figure>{season}</Figure>
        </span>
      ) : null}
      {provisional ? <ProvisionalBadge className="self-center" /> : null}
    </p>
  );
}
