import { useMemo, useRef, useEffect } from "react";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import matchesBandPhoto from "@/assets/photos/matches-header.webp";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import { capitalizeFirst } from "@/lib/match-days";
import { ui, UiButton, UiChip, UiIconButton } from "@/components/ui-kit";
import {
  addMatchDays,
  isSameMatchDay,
  MATCH_TIME_ZONE,
  startOfMatchDay,
} from "@/lib/match-kickoff";

/**
 * The Matches page's date navigation (Option A, A-Matches).
 *
 * A navy photo band — the board's "JOURNÉE 14" band — with round glass
 * previous / next controls at its two ends and, between them, the selected
 * day in the display face over a label line naming the day relative to today
 * and the round its matches belong to ("AUJOURD'HUI · JOURNÉE 14"). Under the
 * band, the ±7-day strip of day chips, and a "Today" shortcut whenever the
 * page is on another day.
 *
 * The data is day-based (`footballService.getMatchDay`; there is no round
 * query), so the arrows step one day and the title is the DAY, known at once
 * on every tap — the round comes from that day's matches when they load
 * (`gameweeks`), and a day with none simply names no round. Titling the band
 * "Journée 14" while the arrows stepped days would promise the next round and
 * deliver the next day.
 *
 * Days are competition-calendar days (`Africa/Casablanca`), not the viewer's:
 * the strip highlights, groups and labels the same day as the match cards
 * below it for a viewer in any zone (BG-0100).
 *
 * Still true:
 *  - ≥44 px targets: the glass controls, each day chip, the shortcut
 *  - no horizontal page overflow: the chips scroll inside their own row,
 *    with the neighbouring days partly visible and the band's arrows above
 *  - RTL-safe: no physical direction utilities; the chevrons are the LTR
 *    icons and styles.css mirrors them under dir="rtl", so they always mean
 *    "earlier / later". (Swapping them on `dir` here as well flipped them
 *    twice: in Arabic "previous day" pointed forward.)
 */
/** A no-break space: holds the context line's height while it is empty. */
const NBSP = String.fromCharCode(0xa0);

export function DateStrip({
  selected,
  onSelect,
  rangeDays = 7,
  minDate,
  maxDate,
  gameweeks = [],
  className,
}: {
  selected: Date;
  onSelect: (d: Date) => void;
  /** Days on each side of the pivot; total = 2*rangeDays + 1. */
  rangeDays?: number;
  /** Optional season boundaries. */
  minDate?: Date;
  maxDate?: Date;
  /** The rounds the selected day's matches belong to, once they are known. */
  gameweeks?: readonly number[];
  className?: string;
}) {
  const { t, lang } = useI18n();
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

  const heading = new Intl.DateTimeFormat(locale, {
    timeZone: MATCH_TIME_ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(selectedDay);

  // "Aujourd'hui · Journée 14": the day relative to today, when it is one of
  // the three a reader names that way, and the round(s) of its matches.
  let relative: string | null = null;
  if (isToday) relative = t("matches.date.today");
  else if (isSameDay(selectedDay, addMatchDays(today, -1))) relative = t("matches.date.yesterday");
  else if (isSameDay(selectedDay, addMatchDays(today, 1))) relative = t("matches.date.tomorrow");
  const round = gameweeks.length > 0 ? `${t("home.gameweek")} ${gameweeks.join(" · ")}` : null;
  const context = [relative, round].filter(Boolean).join(" · ");

  return (
    <div className={cn("min-w-0", className)}>
      <div
        className={cn(
          "relative isolate flex items-center gap-2 overflow-hidden py-3.5",
          // Full-bleed on a phone, a rounded panel from `sm`.
          "-mx-[var(--ui-gutter)] px-[var(--ui-gutter)]",
          "sm:mx-0 sm:rounded-[var(--ui-radius-sheet)] sm:px-3",
          ui.tone.onInkPlain,
          "bg-[color:var(--ui-ink-deep)]",
        )}
      >
        {/* The stands under floodlights, mirrored in Arabic. Decorative. */}
        <img
          src={matchesBandPhoto}
          alt=""
          aria-hidden
          decoding="async"
          className="absolute inset-0 -z-10 h-full w-full object-cover object-[50%_62%] rtl:-scale-x-100"
        />
        {/* A navy veil, `to bottom`: a degree angle, or the board's `to
            right`, would land on the wrong edge under dir="rtl". */}
        <div
          aria-hidden
          className="absolute inset-0 -z-10"
          style={{
            backgroundImage:
              "linear-gradient(to bottom, color-mix(in oklab, var(--ui-ink-deep) 72%, transparent) 0%, color-mix(in oklab, var(--ui-ink-deep) 86%, transparent) 100%)",
          }}
        />
        <UiIconButton
          variant="glass"
          onClick={() => shiftBy(-1)}
          aria-label={t("matches.date.prev")}
          disabled={!canGoPrevious}
        >
          <ChevronLeft />
        </UiIconButton>
        <div className="min-w-0 flex-1 text-center">
          <h2 className={cn("truncate", ui.display.section)}>{capitalizeFirst(heading)}</h2>
          {/* Always one line tall, empty or not, so the band never jumps
              when the day's round arrives. */}
          <p className={cn("truncate", ui.text.label)}>{context || NBSP}</p>
        </div>
        <UiIconButton
          variant="glass"
          onClick={() => shiftBy(1)}
          aria-label={t("matches.date.next")}
          disabled={!canGoNext}
        >
          <ChevronRight />
        </UiIconButton>
      </div>

      <div className="mt-3 flex min-w-0 items-center gap-2">
        {!isToday && todayInRange && (
          <UiButton variant="light" size="sm" onClick={() => onSelect(today)}>
            <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {t("matches.date.jump_today")}
          </UiButton>
        )}
        <div
          ref={scrollerRef}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto scroll-smooth",
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
                  // Every chip states whether it is the day on show, so none
                  // also announces itself as a toggle (`aria-pressed`).
                  aria-current={active ? "date" : false}
                  onClick={() => onSelect(d)}
                  className={cn(
                    "flex-col justify-center gap-0 px-2.5 py-1.5",
                    ui.space.tap,
                    // An unselected "today" is hinted with the ink tone so it
                    // stays findable in a long strip.
                    !active && isDayToday && ui.tone.ink,
                  )}
                >
                  <span className={cn("max-w-full truncate uppercase", ui.text.micro)}>
                    {dayLabel}
                  </span>
                  <span className={ui.stat.md}>{dayFmt.format(d)}</span>
                </UiChip>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
