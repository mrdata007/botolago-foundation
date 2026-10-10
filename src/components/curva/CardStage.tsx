import type { ReactNode } from "react";

import { ManagerCard } from "@/components/manager-card/ManagerCard";
import {
  CARD_STAT_TOTAL,
  OVR_MIN_STATS,
  useCardCopy,
  useMomentCopy,
} from "@/components/manager-card/copy";
import { fill } from "@/components/manager-card/interpolate";
import { TierWord } from "@/components/manager-card/tier-word";
import type { BeatName, CardProfile, TierCode } from "@/components/manager-card/types";
import { ui } from "@/components/ui-kit";
import { cn } from "@/lib/utils";

import { nextSeasonLabel, waitingBox, type WaitingBox } from "./curva-state";
import { Figure, ProvisionalBadge } from "./figures";

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
 * (a window of about 860 px) for a rated card. Below 750 px the card is at its 232 px floor and
 * the line ends 7 px (French) and 8 px (Arabic) above the bar at 740 px, and under it from about
 * 730 px down.
 *
 * A card with no number puts the rating line in a text box (`RatingLine`), taller than the bare
 * line, so G1 reserves more for it and the card is that much shorter (owner's choice, 2026-10-10:
 * the next-round line keeps its 16 px over the bar). Measured at 390 x 844 with 236 px, the
 * next-round line cleared the bar by 6 px (French) and 13 px (Arabic) under the forming box, and
 * ended 39 px (French) and 15 px (Arabic) under the bar's top under the two-line box of a card
 * waiting for a statistic. The worse language sets each reserve, plus 1 px for rounding: 247 px
 * for the forming box, 292 px for the statistics box. The rated line and 768 px up are unchanged.
 */
const FIT_HEIGHT_WIDTH =
  "w-[min(calc(100vw_-_32px),clamp(232px,calc((100svh_-_var(--topbar-h)_-_var(--bottomnav-h)_-_236px)_/_1.618),296px))]";
/** `FIT_HEIGHT_WIDTH` under the forming box (« Carte en formation · 1/3 »). */
const FIT_HEIGHT_WIDTH_ROUNDS_BOX =
  "w-[min(calc(100vw_-_32px),clamp(232px,calc((100svh_-_var(--topbar-h)_-_var(--bottomnav-h)_-_247px)_/_1.618),296px))]";
/** `FIT_HEIGHT_WIDTH` under the two-line box of a card waiting for a statistic. */
const FIT_HEIGHT_WIDTH_STATS_BOX =
  "w-[min(calc(100vw_-_32px),clamp(232px,calc((100svh_-_var(--topbar-h)_-_var(--bottomnav-h)_-_292px)_/_1.618),296px))]";

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
 */
export function CardStage({
  profile,
  beat,
  children,
  className,
  testId = "curva-stage",
  fitHeight = false,
  waiting = null,
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
  /** The rating line is a text box (`waitingBox`): G1 reserves its height under the card. */
  waiting?: WaitingBox | null;
}) {
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
          !fitHeight
            ? FULL_PHONE_WIDTH
            : waiting === "stats"
              ? FIT_HEIGHT_WIDTH_STATS_BOX
              : waiting === "rounds"
                ? FIT_HEIGHT_WIDTH_ROUNDS_BOX
                : FIT_HEIGHT_WIDTH,
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
 * Under the card, in text, always: « 84 OVR · PRO » and the « Provisoire » pill. A new season that
 * has no number of its own yet shows last season's, with that season's label beside it.
 *
 * With no number the line is a text box (a bordered, filled, rounded callout), so the waiting is
 * read as a state and not as a missing figure:
 *
 *   - while the journées are still being counted: « Carte en formation · 1/3 »;
 *   - once they are all counted but fewer than `OVR_MIN_STATS` of the four statistics are filled
 *     (the server's `insufficient`): « Statistiques remplies · 2/4 » and the sentence that says
 *     the note comes with 3 of 4. A full journée counter (« 2/2 ») with no number reads as broken,
 *     so it is never shown in that state.
 *
 * Ordinary DOM, so the words are on screen the moment the data is, before the renderer's chunk
 * has loaded.
 */
export function RatingLine({
  ovr,
  tier,
  provisional,
  counted,
  min,
  statsFilled,
  season,
  formingLabel,
  closedSeason = null,
}: {
  ovr: number | null;
  tier: TierCode | null;
  provisional: boolean;
  counted: number;
  min: number;
  /** How many of the four statistics are filled (`filledStats`). */
  statsFilled: number;
  /** The season the number belongs to, shown when it is not the current one. */
  season?: string | null;
  formingLabel: string;
  /**
   * The card's season label when that season is over: nothing will fill another statistic, so
   * the box says the season ended before a first note (`m3.late`, naming the next season when
   * the label has that shape), never that the note « s'affiche dès que » 3 are filled.
   */
  closedSeason?: string | null;
}) {
  const copy = useCardCopy();
  const moments = useMomentCopy();
  if (ovr === null) {
    // Every journée the rules ask for is counted and there is still no number: what is missing
    // is a statistic (`ratingState: "insufficient"`), not a journée.
    const waitsForStats = waitingBox(ovr, counted, min) === "stats";
    const closedNext = closedSeason ? nextSeasonLabel(closedSeason) : null;
    return (
      <div
        className={cn(
          "w-full max-w-[296px] px-4 py-1.5 text-center md:max-w-[336px]",
          ui.surface.card,
          ui.rule.all,
        )}
        data-testid="curva-rating-line"
        data-waiting={waitsForStats ? "stats" : "rounds"}
      >
        <p className="flex flex-wrap items-baseline justify-center gap-x-2 gap-y-0.5">
          <span className={cn(ui.display.team, ui.tone.default)}>
            {waitsForStats ? copy.statsFilled : formingLabel}
          </span>
          <span aria-hidden className={cn(ui.display.team, ui.tone.muted)}>
            ·
          </span>
          <span className={cn(ui.score.md, ui.tone.default)}>
            <span aria-hidden>
              {waitsForStats ? (
                <Figure>
                  {statsFilled}/{CARD_STAT_TOTAL}
                </Figure>
              ) : (
                <Figure>
                  {counted}/{min}
                </Figure>
              )}
            </span>
            <span className="sr-only">
              {waitsForStats
                ? copy.statsFilledA11y(statsFilled, CARD_STAT_TOTAL)
                : copy.countedA11y(counted, min)}
            </span>
          </span>
        </p>
        {waitsForStats && !closedSeason ? (
          <p className={cn("mt-0.5 text-pretty", ui.text.secondary, ui.tone.muted)}>
            {fill(moments.m3.insufficient, { need: OVR_MIN_STATS, total: CARD_STAT_TOTAL })}
          </p>
        ) : waitsForStats && closedNext ? (
          <p className={cn("mt-0.5 text-pretty", ui.text.secondary, ui.tone.muted)}>
            {fill(moments.m3.late, { season: <Figure>{closedNext}</Figure> })}
          </p>
        ) : null}
      </div>
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
      {provisional ? <ProvisionalBadge className="self-center" /> : null}
    </p>
  );
}
