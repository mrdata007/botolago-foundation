import { useCallback, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { MatchCard } from "@/components/common/MatchCard";
import { ui, UiIconButton } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { prefersReducedMotion } from "@/lib/motion";
import { cn } from "@/lib/utils";
import type { Club, Match } from "@/types/domain";
import { NextMatchPick } from "./NextMatchPick";

/** One card of the band: a match and its two clubs, already found. */
export interface BandCard {
  readonly match: Match;
  readonly home: Club;
  readonly away: Club;
}

/** Up to this many cards the position is a row of dots; beyond, "2 / 8". */
export const CAROUSEL_MAX_DOTS = 6;

/**
 * The track: native scroll snapping, out to the band's edges so the next card
 * peeks to the edge of the screen on a phone (to the band's rounded edge from
 * `sm`). The padding and the snap padding are the band's own, so a card at
 * rest sits on the band's gutter. The block padding leaves room for a card's
 * focus ring, which the track would otherwise clip; the margin takes it back.
 */
const TRACK = cn(
  "flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain",
  "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
  "-mx-[var(--ui-gutter)] px-[var(--ui-gutter)] scroll-px-[var(--ui-gutter)]",
  "sm:-mx-6 sm:px-6 sm:scroll-px-6",
  "-my-1 py-1",
);

/**
 * A card: 88% of the band's width, so about an eighth of the next one shows.
 * From `lg` to `xl` the band is Home's narrow centre column (264 to 519px),
 * where a peek would squeeze the card below what its names need, so a card
 * takes the whole width there; the buttons and the indicator say there is
 * more. A flex item, so every card is as tall as the tallest; its child
 * fills it.
 */
const SLIDE = cn(
  "flex min-w-0 shrink-0 basis-[88%] snap-start lg:basis-full xl:basis-[88%]",
  "[&>*]:min-w-0 [&>*]:flex-1",
);

/**
 * Previous and next: from `lg`, and at any width where the pointer is a mouse.
 * At either end the button says it is unavailable (`aria-disabled`) and looks
 * it, but stays focusable: a `disabled` button drops the focus it holds, and
 * a keyboard reader stepping to the last match would land on the page's body.
 */
const STEP = cn(
  "hidden lg:inline-grid pointer-fine:inline-grid",
  "aria-disabled:cursor-not-allowed aria-disabled:opacity-50",
);

/**
 * Home's gameweek band, when it has more than one match to show (BG-0155):
 * the round's matches side by side, swiped on a phone, stepped with the
 * buttons on a desktop. A live match is the split club-colour card; a match to
 * come is the pick card with its own "Qui va gagner ?" vote.
 *
 * Native scroll snapping rather than a library, as the News carousel does it:
 * it follows the page's direction by itself (in Arabic the first match is on
 * the right and the next comes from the left), swipes without script, and
 * keeps every card's links and buttons in the tab order. The current card is
 * read from the scroll position, so a swipe, the buttons and the indicator
 * always agree. Nothing moves on its own.
 *
 * Every scroll it makes is instant under reduced motion. Tab walks a card's
 * controls and then the next card's; the card that takes the focus is brought
 * to the start of the track. Votes are read for the card in view and its two
 * neighbours; each card holds its vote row's place until then.
 *
 * The first render is the server's: the first card current, the track at its
 * start.
 */
export function HomeMatchCarousel({
  cards,
  withVote,
}: {
  cards: readonly BandCard[];
  /** Offer each match's vote: the caller's say, as it holds the Pronostics flag. */
  withVote: boolean;
}) {
  const { t } = useI18n();
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const count = cards.length;
  // A card that leaves (its match ended) can take the current one with it.
  const current = Math.min(active, Math.max(count - 1, 0));

  const onScroll = useCallback(() => {
    const list = track.current;
    const first = list?.firstElementChild as HTMLElement | null;
    if (!list || !first) return;
    const step = first.offsetWidth + (parseFloat(getComputedStyle(list).columnGap) || 0);
    if (step <= 0) return;
    // scrollLeft runs negative in a right-to-left track; the distance
    // travelled is what counts. The last card cannot reach the start, so the
    // end of the track is the last card.
    const travelled = Math.abs(list.scrollLeft);
    const atEnd = travelled >= list.scrollWidth - list.clientWidth - 1;
    setActive(atEnd ? count - 1 : Math.min(count - 1, Math.round(travelled / step)));
  }, [count]);

  /** Scrolls the track so card `index` starts on the gutter (the last card, as far as it goes). */
  const bringIntoView = (index: number) => {
    const list = track.current;
    const card = list?.children[index] as HTMLElement | undefined;
    if (!list || !card) return;
    const style = getComputedStyle(list);
    const gutter = parseFloat(style.paddingInlineStart) || 0;
    const listBox = list.getBoundingClientRect();
    const cardBox = card.getBoundingClientRect();
    const offset =
      style.direction === "rtl"
        ? cardBox.right - (listBox.right - gutter)
        : cardBox.left - (listBox.left + gutter);
    if (Math.abs(offset) < 1) return;
    list.scrollTo({
      left: list.scrollLeft + offset,
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
  };

  /** Previous (-1) or next (1); nothing past either end. */
  const step = (by: -1 | 1) => {
    const target = current + by;
    if (target < 0 || target >= count) return;
    bringIntoView(target);
  };

  const slideLabel = (index: number) =>
    t("home.carousel.slide")
      .replace("{n}", String(index + 1))
      .replace("{total}", String(count));

  return (
    <div
      role="region"
      aria-roledescription={t("home.carousel.role")}
      aria-label={t("home.carousel.label")}
      className="mt-5"
      data-testid="home-match-carousel"
    >
      <div ref={track} onScroll={onScroll} data-carousel-track className={TRACK}>
        {cards.map(({ match, home, away }, index) => (
          <div
            key={match.id}
            role="group"
            aria-roledescription={t("home.carousel.slide_role")}
            aria-label={slideLabel(index)}
            onFocus={() => bringIntoView(index)}
            className={SLIDE}
          >
            {match.status === "live" ? (
              <MatchCard match={match} home={home} away={away} variant="hero" />
            ) : (
              <NextMatchPick
                match={match}
                home={home}
                away={away}
                withVote={withVote}
                fill
                votesEnabled={Math.abs(index - current) <= 1}
              />
            )}
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-center gap-3">
        {/* The chevrons are the ones the BG-0150 rule mirrors in Arabic, where
            "previous" sits on the right and points right. */}
        <UiIconButton
          variant="glass"
          aria-label={t("home.carousel.previous")}
          aria-disabled={current === 0}
          onClick={() => step(-1)}
          className={STEP}
        >
          <ChevronLeft aria-hidden />
        </UiIconButton>
        {/* Where the reader is. Each card's own label says it ("Match 2 sur
            8"), so this is for the eye only. In Arabic the row runs from the
            right, as the cards do. */}
        <div
          aria-hidden
          data-testid="home-match-carousel-indicator"
          className="flex min-h-2 items-center"
        >
          {count <= CAROUSEL_MAX_DOTS ? (
            <span className="flex items-center gap-1.5">
              {cards.map(({ match }, index) => (
                <span
                  key={match.id}
                  className={cn(
                    "block h-2",
                    ui.radius.full,
                    "transition-[width,background-color] duration-[var(--duration-quick)] ease-[var(--ease-standard)]",
                    index === current
                      ? "w-5 bg-[color:var(--ui-on-ink-plain)]"
                      : "w-2 bg-[color:color-mix(in_oklab,var(--ui-on-ink-plain)_45%,transparent)]",
                  )}
                />
              ))}
            </span>
          ) : (
            <span
              className={cn(
                "flex items-center gap-1",
                ui.text.meta,
                "[font-weight:var(--ui-weight-heavy)]",
                ui.tone.onInkMuted,
              )}
            >
              <span className={ui.tone.onInkPlain}>{current + 1}</span>
              <span>/</span>
              <span>{count}</span>
            </span>
          )}
        </div>
        <UiIconButton
          variant="glass"
          aria-label={t("home.carousel.next")}
          aria-disabled={current === count - 1}
          onClick={() => step(1)}
          className={STEP}
        >
          <ChevronRight aria-hidden />
        </UiIconButton>
      </div>
    </div>
  );
}
