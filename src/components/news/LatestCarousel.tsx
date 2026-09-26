import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import type { ArticleCardDto } from "@/backend/news/contracts";
import { ArticleCard } from "@/components/common/ArticleCard";
import { ui, UiIconButton } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import type { Club } from "@/types/domain";
import { presentArticleForDisplay } from "./news-data";

/** How many of the newest articles fill the top slot when none is picked. */
export const LATEST_CAROUSEL_SIZE = 5;

/**
 * The top slot of /news when no editor has picked a lead or top stories: the
 * newest articles, one card per slide, swiped on a phone or stepped with the
 * arrows and dots.
 *
 * Native scroll snapping rather than a carousel library: it follows the
 * page's direction by itself (in Arabic the first card is on the right and
 * the next one comes from the left), swipes without script, and keeps each
 * card a real link. The index is read from the scroll position, so swiping
 * and the controls always agree. No autoplay: a slot that moves on its own
 * is hard to read and to click.
 */
export function LatestCarousel({
  articles,
  clubs,
}: {
  articles: readonly ArticleCardDto[];
  clubs: readonly Club[];
}) {
  const { t } = useI18n();
  const scroller = useRef<HTMLUListElement>(null);
  const [active, setActive] = useState(0);
  const count = articles.length;

  const onScroll = useCallback(() => {
    const list = scroller.current;
    const first = list?.firstElementChild as HTMLElement | null;
    if (!list || !first) return;
    // scrollLeft runs negative in a right-to-left scroller; the distance
    // travelled is what counts.
    const step = first.offsetWidth + parseFloat(getComputedStyle(list).columnGap || "0");
    if (step > 0) setActive(Math.min(count - 1, Math.round(Math.abs(list.scrollLeft) / step)));
  }, [count]);

  useEffect(() => {
    setActive(0);
    scroller.current?.scrollTo({ left: 0 });
  }, [articles]);

  const goTo = (index: number) => {
    const slide = scroller.current?.children[index] as HTMLElement | undefined;
    slide?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
  };

  if (count === 0) return null;

  return (
    <div
      role="region"
      // A role description is read out as it is written, in place of the
      // role's own name, so it is copy like any other: in English it was
      // "carousel" to a French or Arabic reader.
      aria-roledescription={t("news.carousel.role")}
      aria-label={t("news.section.lead")}
      className="grid gap-2.5"
    >
      <ul
        ref={scroller}
        onScroll={onScroll}
        className={cn(
          "flex snap-x snap-mandatory gap-2.5 overflow-x-auto overscroll-x-contain",
          "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        )}
      >
        {articles.map((dto, index) => (
          <li
            key={dto.id}
            role="group"
            aria-roledescription={t("news.carousel.slide_role")}
            aria-label={t("news.carousel.slide")
              .replace("{n}", String(index + 1))
              .replace("{total}", String(count))}
            className="min-w-0 shrink-0 basis-[88%] snap-start sm:basis-[80%]"
          >
            <ArticleCard article={presentArticleForDisplay(dto)} variant="imageLed" clubs={clubs} />
          </li>
        ))}
      </ul>

      {count > 1 && (
        <div className="flex items-center justify-center gap-3">
          <UiIconButton
            variant="ghost"
            aria-label={t("news.carousel.previous")}
            disabled={active === 0}
            onClick={() => goTo(active - 1)}
            className="disabled:opacity-40"
          >
            <ChevronLeft aria-hidden />
          </UiIconButton>
          <div className="flex items-center">
            {articles.map((dto, index) => (
              // The dot stays small; the button around it is a 24 x 32 px
              // target, so a thumb lands on the slide it aims at.
              <button
                key={dto.id}
                type="button"
                aria-label={t("news.carousel.slide")
                  .replace("{n}", String(index + 1))
                  .replace("{total}", String(count))}
                aria-current={index === active ? "true" : undefined}
                onClick={() => goTo(index)}
                className={cn("grid h-8 min-w-6 place-items-center px-1", ui.focus)}
              >
                <span
                  aria-hidden
                  className={cn(
                    "block h-2 rounded-full transition-[width,background-color] duration-200",
                    index === active
                      ? "w-5 bg-[color:var(--ui-ink-fg)]"
                      : "w-2 bg-[color:var(--ui-rule-strong)]",
                  )}
                />
              </button>
            ))}
          </div>
          <UiIconButton
            variant="ghost"
            aria-label={t("news.carousel.next")}
            disabled={active === count - 1}
            onClick={() => goTo(active + 1)}
            className="disabled:opacity-40"
          >
            <ChevronRight aria-hidden />
          </UiIconButton>
        </div>
      )}
    </div>
  );
}
