import { FlipHorizontal2 } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { ManagerCard } from "@/components/manager-card/ManagerCard";
import { useCardCopy } from "@/components/manager-card/copy";
import { useMotionCopy } from "@/components/manager-card/motion-copy";
import { TierWord } from "@/components/manager-card/tier-word";
import type { BeatName, CardProfile, TierCode } from "@/components/manager-card/types";
import { ui, UiBadge, UiIconButton } from "@/components/ui-kit";
import { prefersReducedMotion, tokenMs } from "@/lib/motion";
import { useMotionAllowed } from "./use-replay-beat";
import { cn } from "@/lib/utils";

import { CardBack } from "./CardBack";
import { Figure, ProvisionalBadge } from "./figures";
import { deltaArrow, signedDelta } from "./rating-change";
import type { RatingBadge } from "./use-rating-change";
import { useStageEntrance } from "./use-stage-entrance";

/** The card on a phone: 296 px, and never closer than 16 px to either edge. */
const FULL_PHONE_WIDTH = "w-[min(296px,calc(100vw-32px))]";

/**
 * The card on a phone when the first screen has to hold what lies under it (G1). The card's height
 * is the window's small height (`svh`: with a browser's toolbars showing) less the top bar, the
 * bottom bar and what G1 draws around the card, and its width is that height over 1.618, between
 * 232 px and the 296 px of `FULL_PHONE_WIDTH` (and still 16 px from either edge).
 *
 * The two bars are read from their tokens (`--topbar-h`, `--bottomnav-h`) because they grow with a
 * phone's home indicator and, for the bottom bar, with Arabic's leading (76 px in French, 82 px in
 * Arabic at rest). What G1 draws around the card and the bars, measured at 390 x 844: the page
 * title and the stage's top padding, the 12 px under the card, the rating line, the identity line
 * and the 44 px next-round line, which come to 216 px in French and 209 px in Arabic (whose title
 * is 22 px taller and whose lines are taller, and whose stage gives back 40 px of padding for it).
 * 236 px keeps the next-round line 16 px or more above the bottom bar in both languages (19.9 px in
 * French, 27 px in Arabic) for every height from 750 px up to where the card reaches its 296 px
 * (a window of about 860 px); below 750 px the card is at its 232 px floor and the line ends 7 px (French)
 * and 8 px (Arabic) above the bar at 740 px, and under it from about 730 px down.
 */
const FIT_HEIGHT_WIDTH =
  "w-[min(calc(100vw_-_32px),clamp(232px,calc((100svh_-_var(--topbar-h)_-_var(--bottomnav-h)_-_236px)_/_1.618),296px))]";

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
 *
 * G1 asks for more of a phone's height (`fitHeight`): the card, the rating line, the identity line
 * and the next-round line are one first screen, and the line has to clear the bottom bar. See
 * `FIT_HEIGHT_WIDTH`.
 *
 * Two things move around the card, on wrappers outside its 3D tree (`tilt.ts` owns that and is
 * left alone): `flippable` adds « Retourner », a round button on the card's lower corner that turns
 * the card over to its back (`CardBack`, plain DOM); `entrance` plays the card's arrival once per
 * visit (`use-stage-entrance.ts`). Neither changes the card's box. The card's tilt and touch float
 * stay off while the back shows and while the entrance plays.
 */
export function CardStage({
  profile,
  beat,
  children,
  className,
  testId = "curva-stage",
  fitHeight = false,
  flippable = false,
  entrance,
}: {
  profile: CardProfile;
  beat?: BeatName;
  /** The rating line and what follows it, centred under the card. */
  children?: ReactNode;
  className?: string;
  testId?: string;
  /**
   * On a phone, the card's width follows the window's height (G1's first screen), never below
   * 232 px and never above the 296 px of `FULL_PHONE_WIDTH`.
   */
  fitHeight?: boolean;
  /** Draw « Retourner » and the card's back. */
  flippable?: boolean;
  /** Play the card's arrival once per visit; `heroDue` says whether a hero will carry the card. */
  entrance?: { heroDue: () => boolean };
}) {
  const motion = useMotionCopy();
  const [back, setBack] = useState(false);
  const [turning, setTurning] = useState(false);
  const [announce, setAnnounce] = useState("");
  const stage = useStageEntrance({
    enabled: !!entrance,
    heroDue: entrance?.heroDue ?? (() => false),
  });

  // The turn is a CSS transition; it ends with `transitionend`, with a timer behind it for a turn
  // that was cut short (a hidden tab, a removed node), so the 3D context never outlives it.
  useEffect(() => {
    if (!turning) return;
    const timer = window.setTimeout(() => setTurning(false), tokenMs("--duration-hero", 420) + 120);
    return () => window.clearTimeout(timer);
  }, [turning]);

  const flip = () => {
    const next = !back;
    setBack(next);
    setAnnounce(next ? motion.flip.shownBack : motion.flip.shownFront);
    // Under reduced motion the faces swap at once: no turn, no 3D context at all.
    if (motionOk && !prefersReducedMotion()) setTurning(true);
  };
  // False on the server, in the first client render and under reduced motion: the faces then swap
  // by being shown and hidden, with no 3D context and no transform at all.
  const motionOk = useMotionAllowed();
  const in3d = motionOk && (back || turning);

  return (
    <section
      className={cn(
        "relative overflow-x-clip px-2 pb-[18px] pt-5 md:pt-6",
        // Arabic's line boxes are taller (leading 1.95 on the title, the rating and the identity
        // lines): on a phone the stage gives back the room its own padding does not need, so the
        // round line under the identity still sits above the bottom bar (G1's acceptance). G1,
        // which reads the window's height, gives back 4 px more over the card
        "max-md:rtl:pb-0",
        fitHeight ? "max-md:rtl:pt-2" : "max-md:rtl:pt-3",
        className,
      )}
      data-stage={profile.tier ?? "base"}
    >
      <div
        data-stage-card=""
        className={cn(
          "group/stage relative mx-auto max-w-full md:w-[336px]",
          fitHeight ? FIT_HEIGHT_WIDTH : FULL_PHONE_WIDTH,
        )}
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
        {entrance ? (
          <span
            ref={stage.groundRef}
            aria-hidden
            data-stage-ground=""
            className={cn(
              "pointer-events-none absolute -bottom-[15px] start-[7%] z-0 h-[18px] w-[86%] opacity-0",
              "bg-[radial-gradient(closest-side,color-mix(in_oklab,black_34%,transparent),transparent)]",
              "dark:bg-[radial-gradient(closest-side,color-mix(in_oklab,black_60%,transparent),transparent)]",
            )}
          />
        ) : null}
        <div ref={stage.liftRef} data-stage-lift="" className="relative z-10">
          {flippable ? (
            <div
              data-stage-flip=""
              data-side={back ? "back" : "front"}
              className={cn(in3d && "[perspective:1400px]")}
            >
              <div
                data-flip-inner=""
                className={cn(
                  "relative transition-transform duration-[var(--duration-hero)] ease-[var(--ease-emphasized)]",
                  in3d && "[transform-style:preserve-3d]",
                )}
                style={{
                  transform:
                    motionOk && back ? "rotateY(calc(var(--vt-dir, 1) * 180deg))" : undefined,
                }}
                onTransitionEnd={(event) => {
                  if (event.target === event.currentTarget) setTurning(false);
                }}
              >
                <div
                  data-flip-face="front"
                  className={cn("[backface-visibility:hidden]", !motionOk && back && "invisible")}
                  inert={back}
                  aria-hidden={back || undefined}
                >
                  <ManagerCard
                    profile={profile}
                    width={336}
                    beat={beat}
                    tilt={!back && !stage.entering}
                    testId={testId}
                    className="relative"
                  />
                </div>
                <div
                  data-flip-face="back"
                  className={cn(
                    "absolute inset-0 [backface-visibility:hidden]",
                    !motionOk && !back && "invisible",
                  )}
                  style={{
                    transform: motionOk ? "rotateY(calc(var(--vt-dir, 1) * 180deg))" : undefined,
                  }}
                  inert={!back}
                  aria-hidden={!back || undefined}
                >
                  <CardBack profile={profile} />
                </div>
              </div>
            </div>
          ) : (
            <ManagerCard
              profile={profile}
              width={336}
              beat={beat}
              tilt={!stage.entering}
              testId={testId}
              className="relative"
            />
          )}
        </div>
        {flippable ? (
          <>
            <UiIconButton
              variant="ink"
              aria-label={motion.flip.label}
              title={motion.flip.label}
              aria-pressed={back}
              data-testid="curva-flip"
              onClick={flip}
              className={cn(
                "absolute -bottom-3 -start-2 z-20 ring-1 ring-white/25",
                // a ring that shows on every tier and both themes: white, with a black offset
                "focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black",
              )}
            >
              <FlipHorizontal2 aria-hidden />
            </UiIconButton>
            <p role="status" className="sr-only" data-testid="curva-flip-status">
              {announce}
            </p>
          </>
        ) : null}
      </div>
      {children ? (
        <div
          className={cn(
            "mt-3 flex flex-col items-center gap-1 px-4",
            fitHeight ? "max-md:rtl:mt-1.5" : "max-md:rtl:mt-2",
          )}
        >
          {children}
        </div>
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
  change,
}: {
  ovr: number | null;
  tier: TierCode | null;
  provisional: boolean;
  counted: number;
  min: number;
  /** The season the number belongs to, shown when it is not the current one. */
  season?: string | null;
  formingLabel: string;
  /**
   * How the number moved at the latest round (« +3 ▲ »): drawn beside the number, popping once
   * when `pop` is set. Absent with no earlier number or no change.
   */
  change?: RatingBadge | null;
}) {
  const copy = useCardCopy();
  if (ovr === null) {
    return (
      <p
        className="flex flex-wrap items-baseline justify-center gap-x-2 gap-y-1"
        data-testid="curva-rating-line"
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
      data-testid="curva-rating-line"
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
      {change ? <RatingChangeChip change={change} /> : null}
      {provisional ? <ProvisionalBadge className="self-center" /> : null}
    </p>
  );
}

/**
 * « +3 ▲ » / « −2 ▼ » in the positive or negative colour, with the arrow as the second cue after
 * the colour and the sentence for a screen reader (« note en hausse de 3 »). The figure and the
 * arrow are one left-to-right run (`<bdi dir="ltr">`), so Arabic keeps « +3 ▲ ». It pops once
 * (`pop`, the app's overshoot) when `change.pop` says this round is new on this phone.
 */
function RatingChangeChip({ change }: { change: RatingBadge }) {
  const motion = useMotionCopy();
  const up = change.delta > 0;
  return (
    <UiBadge
      tone={up ? "positive" : "negative"}
      className={cn("self-center gap-1 px-2 py-0.5", change.pop && "pop")}
    >
      <span
        data-testid="curva-rating-change"
        data-change={up ? "up" : "down"}
        data-pop={change.pop ? "1" : undefined}
        className="inline-flex items-center"
      >
        <bdi dir="ltr" aria-hidden>
          {signedDelta(change.delta)} {deltaArrow(change.delta)}
        </bdi>
        <span className="sr-only">{motion.deltaA11y(up, Math.abs(change.delta))}</span>
      </span>
    </UiBadge>
  );
}
