import { useCallback, useRef, useState, type ReactNode } from "react";

import { ui } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

export interface SwipeSlide {
  readonly key: string;
  readonly node: ReactNode;
}

/**
 * Cards side by side, one in view at full width, swiped on a phone or picked
 * with the dots below: the news carousel's mechanics (`LatestCarousel`),
 * without its arrows or its peek at the next card. Full width, because the
 * prediction card's steppers need the whole 360px row.
 *
 * Native scroll snapping follows the page's direction by itself (in Arabic
 * the first card is on the right and the next one comes from the left), and
 * the active dot is read from the scroll position, so a swipe and the dots
 * always agree. Every slide is as tall as the tallest, so the dots do not jump.
 */
export function SwipeDeck({
  label,
  slides,
  testId,
}: {
  label: string;
  slides: readonly SwipeSlide[];
  testId?: string;
}) {
  const { t } = useI18n();
  const scroller = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const count = slides.length;

  const onScroll = useCallback(() => {
    const list = scroller.current;
    const first = list?.firstElementChild as HTMLElement | null;
    if (!list || !first) return;
    // scrollLeft runs negative in a right-to-left scroller; the distance
    // travelled is what counts.
    const step = first.offsetWidth + parseFloat(getComputedStyle(list).columnGap || "0");
    if (step > 0) setActive(Math.min(count - 1, Math.round(Math.abs(list.scrollLeft) / step)));
  }, [count]);

  const goTo = (index: number) => {
    const slide = scroller.current?.children[index] as HTMLElement | undefined;
    slide?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
  };

  const slideLabel = (index: number) =>
    t("predictions.votes.slide")
      .replace("{n}", String(index + 1))
      .replace("{total}", String(count));

  return (
    <div
      role="region"
      aria-roledescription="carousel"
      aria-label={label}
      className="grid gap-1"
      data-testid={testId}
    >
      <div
        ref={scroller}
        onScroll={onScroll}
        data-swipe-row
        className={cn(
          "flex snap-x snap-mandatory gap-2.5 overflow-x-auto overscroll-x-contain",
          "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        )}
      >
        {slides.map((slide, index) => (
          <div
            key={slide.key}
            role="group"
            aria-roledescription="slide"
            aria-label={slideLabel(index)}
            className="flex min-w-0 shrink-0 basis-full snap-start [&>*]:flex-1"
          >
            {slide.node}
          </div>
        ))}
      </div>

      {count > 1 ? (
        <div className="flex items-center justify-center">
          {slides.map((slide, index) => (
            // The dot stays small; the button around it is a 24 x 32 px
            // target, so a thumb lands on the card it aims at.
            <button
              key={slide.key}
              type="button"
              aria-label={slideLabel(index)}
              aria-current={index === active ? "true" : undefined}
              onClick={() => goTo(index)}
              className={cn("grid h-8 min-w-6 place-items-center px-1", ui.focus)}
            >
              <span
                aria-hidden
                className={cn(
                  "block h-2 rounded-full transition-[width,background-color] duration-200 motion-reduce:transition-none",
                  index === active
                    ? "w-5 bg-[color:var(--ui-ink-fg)]"
                    : "w-2 bg-[color:var(--ui-rule-strong)]",
                )}
              />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
