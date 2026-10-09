import type { ReactNode } from "react";

import { ManagerCard } from "@/components/manager-card/ManagerCard";
import { useCardCopy } from "@/components/manager-card/copy";
import { TierWord } from "@/components/manager-card/tier-word";
import type { BeatName, CardProfile, TierCode } from "@/components/manager-card/types";
import { ui } from "@/components/ui-kit";
import { cn } from "@/lib/utils";

import { Figure, ProvisionalBadge } from "./figures";

/**
 * Where the card stands (plan section 10). The collectible is the one expressive object on the
 * page and it is lit from within its own drawing: its contact shadow, its thickness and its light
 * come with the markup (the renderer's `tilt` moves them with the pointer). The stage therefore
 * draws nothing around it but room: 8 px each side and 18 px under the card for the tilt's travel
 * and the shadow it casts, and, until the renderer's chunk has arrived and the card draws its own,
 * an ellipse under the reserved box so the box does not look like a hole.
 *
 * Full cards are 296 px wide on phones (never closer than 16 px to either edge) and 336 px from
 * 768 px, centred. Every card has one shape (1 : 1.618), so the box reserved before the chunk loads
 * is exactly the box the card fills.
 */
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
  return (
    <section
      className={cn(
        "relative overflow-x-clip px-2 pb-[18px] pt-5 md:pt-6",
        // Arabic's line boxes are taller (leading 1.95 on the title, the rating and the identity
        // lines): on a phone the stage gives back the room its own padding does not need, so the
        // round line under the identity still sits above the bottom bar (G1's acceptance)
        "max-md:rtl:pb-0 max-md:rtl:pt-3",
        className,
      )}
      data-stage={profile.tier ?? "base"}
    >
      <div
        data-stage-card=""
        className="group/stage relative mx-auto w-[min(296px,calc(100vw-32px))] max-w-full md:w-[336px]"
      >
        <span
          aria-hidden
          data-stage-shadow=""
          className={cn(
            "pointer-events-none absolute -bottom-[15px] start-[7%] z-0 h-[18px] w-[86%]",
            "bg-[radial-gradient(closest-side,color-mix(in_oklab,black_28%,transparent),transparent)]",
            "dark:bg-[radial-gradient(closest-side,color-mix(in_oklab,black_50%,transparent),transparent)]",
            "group-has-[[data-mc-ready]]/stage:hidden",
          )}
        />
        <ManagerCard
          profile={profile}
          width={336}
          beat={beat}
          tilt
          testId={testId}
          className="relative z-10"
        />
      </div>
      {children ? (
        <div className="mt-3 flex flex-col items-center gap-1 px-4 max-md:rtl:mt-2">{children}</div>
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
            <Figure>
              {counted}/{min}
            </Figure>
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
          <span className={cn(ui.display.team, ui.tone.default)}>
            <TierWord tier={tier} />
          </span>
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
