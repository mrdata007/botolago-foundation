import { useMemo, useRef, useEffect } from "react";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import { ui, UiButton, UiCard, UiChip } from "@/components/ui-kit";
import {
  addMatchDays,
  isSameMatchDay,
  MATCH_TIME_ZONE,
  startOfMatchDay,
} from "@/lib/match-kickoff";

/**
 * Compact date strip.
 *
 * A horizontal strip of ±7 days around a pivot date, with previous / next
 * buttons and a "Today" shortcut.
 *
 * Converted to the shared UI kit: the strip is now a thin arrangement of kit
 * primitives rather than a second implementation of a chip row. Each day is a
 * `UiChip` (so a selected day here and a selected filter anywhere else in the
 * product are literally the same control), the nav buttons and the Today
 * shortcut are `UiButton`s, and the shell is a `UiCard`.
 *
 * Public props are unchanged.
 *
 * Days are competition-calendar days (`Africa/Casablanca`), not the
 * viewer's: the strip highlights, groups and labels the same day as the
 * match cards below it for a viewer in any zone (BG-0100).
 *
 * Still true after the conversion:
 *  - ≥44 px touch targets on nav buttons and each day cell (`--ui-tap-min`)
 *  - keyboard/focus support via native <button> and the kit focus ring
 *  - no horizontal clipping (overflow-x-auto + hidden scrollbar)
 *  - no layout shift (fixed row height, tabular figures)
 *  - RTL-safe: no physical direction utilities; the chevrons are swapped on
 *    `dir` so they always mean "earlier / later".
 */
export function DateStrip({
  selected,
  onSelect,
  rangeDays = 7,
  minDate,
  maxDate,
}: {
  selected: Date;
  onSelect: (d: Date) => void;
  /** Days on each side of the pivot; total = 2*rangeDays + 1. */
  rangeDays?: number;
  /** Optional season boundaries. */
  minDate?: Date;
  maxDate?: Date;
}) {
  const { t, lang, dir } = useI18n();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLDivElement>(null);

  // Every boundary below is competition-zone midnight. Using the browser's
  // midnight instead is what filed a 20:00 Casablanca kickoff under the wrong
  // day for anyone outside UTC+1 (BG-0100).
  const today = useMemo(() => startOfMatchDay(new Date()), []);
  const selectedDay = useMemo(() => startOfMatchDay(selected), [selected]);
  const minimumDay = useMemo(() => (minDate ? startOfMatchDay(minDate) : null), [minDate]);
  const maximumDay = useMemo(() => (maxDate ? startOfMatchDay(maxDate) : null), [maxDate]);

  const days = useMemo(() => {
    const list: Date[] = [];
    for (let i = -rangeDays; i <= rangeDays; i++) {
      // Calendar-day steps, not `+ i * 86_400_000`: Morocco's offset moves
      // for Ramadan, so some days are not 24 hours long.
      const d = addMatchDays(selectedDay, i);
      if (minimumDay && d < minimumDay) continue;
      if (maximumDay && d > maximumDay) continue;
      list.push(d);
    }
    return list;
  }, [selectedDay, rangeDays, minimumDay, maximumDay]);

  const locale = lang === "ar" ? "ar-MA" : "fr-FR";
  const weekdayFmt = new Intl.DateTimeFormat(locale, {
    timeZone: MATCH_TIME_ZONE,
    weekday: "short",
  });
  const dayFmt = new Intl.DateTimeFormat(locale, { timeZone: MATCH_TIME_ZONE, day: "numeric" });
  const monthFmt = new Intl.DateTimeFormat(locale, {
    timeZone: MATCH_TIME_ZONE,
    month: "short",
    year: "numeric",
  });

  // Center the active day when it changes.
  //
  // This measures the active cell against the scroller's own box rather than
  // using `offsetLeft`: `offsetLeft` is relative to the nearest positioned
  // ancestor, which is not the scroller, so it lands the selected day short by
  // the scroller's own page offset (it was sitting clipped at the inline-start
  // edge). Deriving the delta from the two rects and adding the current
  // `scrollLeft` is correct in both directions — Chromium reports a negative
  // `scrollLeft` under RTL and this arithmetic carries that through.
  useEffect(() => {
    const scroller = scrollerRef.current;
    const active = activeRef.current;
    if (!scroller || !active) return;
    const scrollerBox = scroller.getBoundingClientRect();
    const activeBox = active.getBoundingClientRect();
    const delta = activeBox.left - scrollerBox.left + activeBox.width / 2 - scrollerBox.width / 2;
    scroller.scrollTo({ left: scroller.scrollLeft + delta, behavior: "smooth" });
  }, [selectedDay]);

  const shiftBy = (delta: number) => {
    const d = addMatchDays(selectedDay, delta);
    if (minimumDay && d < minimumDay) return;
    if (maximumDay && d > maximumDay) return;
    onSelect(d);
  };

  const isSameDay = isSameMatchDay;

  const isToday = isSameDay(selectedDay, today);
  const todayInRange = (!minimumDay || today >= minimumDay) && (!maximumDay || today <= maximumDay);
  const canGoPrevious = !minimumDay || selectedDay > minimumDay;
  const canGoNext = !maximumDay || selectedDay < maximumDay;

  // Chevrons should always look like "go earlier / later" regardless of RTL,
  // which is what users expect. `dir` tells us the runtime direction.
  const PrevIcon = dir === "rtl" ? ChevronRight : ChevronLeft;
  const NextIcon = dir === "rtl" ? ChevronLeft : ChevronRight;

  const heading = new Intl.DateTimeFormat(locale, {
    timeZone: MATCH_TIME_ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(selectedDay);

  /** A square ≥44px nav button on the kit's ghost tone. */
  const navButtonClass = "w-[var(--ui-tap-min)] shrink-0 px-0";

  return (
    <UiCard padding="sm" className="flex min-w-0 flex-col gap-2">
      {/* Header row: month + Today shortcut */}
      <div className="flex items-center gap-2 px-1">
        <div className="min-w-0 flex-1">
          <div className={cn("truncate", ui.text.label, ui.tone.ink)}>
            {monthFmt.format(selectedDay)}
          </div>
          <div className={cn("truncate", ui.text.bodyStrong, ui.tone.default)}>{heading}</div>
        </div>
        {!isToday && todayInRange && (
          <UiButton variant="light" size="sm" onClick={() => onSelect(today)}>
            <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {t("matches.date.jump_today")}
          </UiButton>
        )}
      </div>

      {/* Navigation + strip */}
      <div className="flex min-w-0 items-center gap-1">
        <UiButton
          variant="ghost"
          size="sm"
          onClick={() => shiftBy(-1)}
          aria-label={t("matches.date.prev")}
          disabled={!canGoPrevious}
          className={cn(navButtonClass, "disabled:opacity-35")}
        >
          <PrevIcon className="h-5 w-5" aria-hidden />
        </UiButton>

        <div
          ref={scrollerRef}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-1 overflow-x-auto scroll-smooth",
            "[scrollbar-width:none] [-ms-overflow-style:none]",
            "[&::-webkit-scrollbar]:hidden",
          )}
          role="group"
          aria-label={t("matches.a11y.date_navigation")}
        >
          {days.map((d) => {
            const active = isSameDay(d, selectedDay);
            const isDayToday = isSameDay(d, today);
            const dayLabel = isDayToday ? t("matches.date.today") : weekdayFmt.format(d);
            return (
              <div key={d.toISOString()} ref={active ? activeRef : undefined} className="shrink-0">
                <UiChip
                  selected={active}
                  onClick={() => onSelect(d)}
                  className={cn(
                    "flex-col justify-center px-2.5 py-1.5",
                    ui.space.tap,
                    "leading-tight",
                    // An unselected "today" is hinted with the ink tone so it
                    // stays findable in a long strip.
                    !active && isDayToday && ui.tone.ink,
                  )}
                >
                  <span className={cn("max-w-full truncate uppercase", ui.text.micro)}>
                    {dayLabel}
                  </span>
                  <span
                    className={cn(
                      "mt-0.5 leading-none",
                      ui.text.body,
                      ui.text.tabular,
                      "[font-weight:var(--ui-weight-hero)]",
                    )}
                  >
                    {dayFmt.format(d)}
                  </span>
                </UiChip>
              </div>
            );
          })}
        </div>

        <UiButton
          variant="ghost"
          size="sm"
          onClick={() => shiftBy(1)}
          aria-label={t("matches.date.next")}
          disabled={!canGoNext}
          className={cn(navButtonClass, "disabled:opacity-35")}
        >
          <NextIcon className="h-5 w-5" aria-hidden />
        </UiButton>
      </div>
    </UiCard>
  );
}
