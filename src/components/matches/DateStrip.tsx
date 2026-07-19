import { useMemo, useRef, useEffect } from "react";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

/**
 * Design System V2 — Compact date strip.
 *
 * A horizontal strip of ±7 days around a pivot date, with previous / next
 * buttons and a "Today" shortcut. Selected date renders as a premium
 * brand-primary pill (not oversized). Fully RTL-safe: the strip's scroll
 * behaviour still centers the selected day; the chevron icons are auto
 * mirrored by global styles.
 *
 * Requirements met:
 *  - ≥44 px touch targets on nav buttons and each day cell
 *  - keyboard/focus support via native <button>
 *  - no horizontal clipping (overflow-x-auto + hidden scrollbar)
 *  - no layout shift (fixed row height, tabular numerics)
 */
export function DateStrip({
  selected,
  onSelect,
  rangeDays = 7,
}: {
  selected: Date;
  onSelect: (d: Date) => void;
  /** Days on each side of the pivot; total = 2*rangeDays + 1. */
  rangeDays?: number;
}) {
  const { t, lang, dir } = useI18n();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  const startOfDay = (d: Date) => {
    const c = new Date(d);
    c.setHours(0, 0, 0, 0);
    return c;
  };
  const today = useMemo(() => startOfDay(new Date()), []);
  const selectedDay = useMemo(() => startOfDay(selected), [selected]);

  const days = useMemo(() => {
    const list: Date[] = [];
    for (let i = -rangeDays; i <= rangeDays; i++) {
      const d = new Date(selectedDay);
      d.setDate(d.getDate() + i);
      list.push(d);
    }
    return list;
  }, [selectedDay, rangeDays]);

  const locale = lang === "ar" ? "ar-MA" : "fr-FR";
  const weekdayFmt = new Intl.DateTimeFormat(locale, { weekday: "short" });
  const dayFmt = new Intl.DateTimeFormat(locale, { day: "numeric" });
  const monthFmt = new Intl.DateTimeFormat(locale, { month: "short", year: "numeric" });

  // Center the active day when it changes.
  useEffect(() => {
    const scroller = scrollerRef.current;
    const active = activeRef.current;
    if (!scroller || !active) return;
    const target = active.offsetLeft - scroller.clientWidth / 2 + active.clientWidth / 2;
    scroller.scrollTo({ left: target, behavior: "smooth" });
  }, [selectedDay]);

  const shiftBy = (delta: number) => {
    const d = new Date(selectedDay);
    d.setDate(d.getDate() + delta);
    onSelect(d);
  };

  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  const isToday = isSameDay(selectedDay, today);

  // Chevron flipping: chevrons should always look like "go earlier / later"
  // regardless of RTL, which is what users expect. `dir` tells us runtime.
  const PrevIcon = dir === "rtl" ? ChevronRight : ChevronLeft;
  const NextIcon = dir === "rtl" ? ChevronLeft : ChevronRight;

  const heading = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(selectedDay);

  return (
    <div
      className={cn(
        "surface-3 flex flex-col gap-2 p-2",
        "border border-[var(--glass-border)]",
      )}
    >
      {/* Header row: month + Today shortcut */}
      <div className="flex items-center gap-2 px-1">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[10px] font-black uppercase tracking-[0.16em] text-[color:var(--brand-accent)]">
            {monthFmt.format(selectedDay)}
          </div>
          <div className="truncate text-sm font-black tracking-tight text-foreground">
            {heading}
          </div>
        </div>
        {!isToday && (
          <button
            type="button"
            onClick={() => onSelect(today)}
            className={cn(
              "inline-flex h-11 items-center gap-1.5 rounded-xl px-3 text-xs font-semibold",
              "bg-[color:var(--surface-hover)] text-foreground",
              "hover:bg-[color:var(--surface-selected)]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-accent)]",
            )}
          >
            <CalendarDays className="h-3.5 w-3.5" aria-hidden />
            {t("matches.date.jump_today")}
          </button>
        )}
      </div>

      {/* Navigation + strip */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => shiftBy(-1)}
          aria-label={t("matches.date.prev")}
          className={cn(
            "grid h-11 w-11 shrink-0 place-items-center rounded-xl text-foreground",
            "hover:bg-[color:var(--surface-hover)]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-accent)]",
          )}
        >
          <PrevIcon className="h-5 w-5" aria-hidden />
        </button>

        <div
          ref={scrollerRef}
          className={cn(
            "flex flex-1 items-center gap-1 overflow-x-auto scroll-smooth",
            "[scrollbar-width:none] [-ms-overflow-style:none]",
            "[&::-webkit-scrollbar]:hidden",
          )}
          role="tablist"
          aria-label={t("matches.title")}
        >
          {days.map((d) => {
            const active = isSameDay(d, selectedDay);
            const isDayToday = isSameDay(d, today);
            const dayLabel = isDayToday
              ? t("matches.date.today")
              : weekdayFmt.format(d);
            return (
              <button
                key={d.toISOString()}
                type="button"
                ref={active ? activeRef : undefined}
                onClick={() => onSelect(d)}
                role="tab"
                aria-selected={active}
                aria-current={active ? "date" : undefined}
                className={cn(
                  "flex min-h-[44px] min-w-[44px] shrink-0 flex-col items-center justify-center rounded-xl px-2.5 py-1.5",
                  "text-[10px] font-semibold uppercase tracking-wide leading-tight transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-accent)]",
                  active
                    ? "bg-[color:var(--brand-primary)] text-white shadow-card"
                    : isDayToday
                      ? "bg-[color:var(--surface-selected)] text-[color:var(--brand-primary)]"
                      : "text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-hover)] hover:text-foreground",
                )}
              >
                <span className="truncate">{dayLabel}</span>
                <span
                  className={cn(
                    "mt-0.5 text-base font-black tabular-nums leading-none",
                    active ? "text-white" : "text-foreground",
                  )}
                >
                  {dayFmt.format(d)}
                </span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => shiftBy(1)}
          aria-label={t("matches.date.next")}
          className={cn(
            "grid h-11 w-11 shrink-0 place-items-center rounded-xl text-foreground",
            "hover:bg-[color:var(--surface-hover)]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-accent)]",
          )}
        >
          <NextIcon className="h-5 w-5" aria-hidden />
        </button>
      </div>
    </div>
  );
}
