// BotolaGO shell — Bottom navigation, on the UI kit (Option A "Club colours").
//
// A full-bleed opaque bar seated on the viewport edge, a hairline rule at the
// block start, ≥44×44 tap targets and the kit's micro type. The active item
// carries the action-gradient pill behind its icon — the one place the
// product's action colour marks "you are here".
//
// The pill alone is NOT the state cue. Spring→sky on the white bar measures
// about 1.34:1, which is a decoration, not a boundary (WCAG 1.4.11). So the
// active label also changes weight and colour (heavy, full-strength
// foreground against the muted strong-weight inactive labels), and
// `aria-current="page"` says it to assistive tech. Do not remove either.
//
// Items stay `flex-1`, never a fixed column count: the bar lays out 4 items
// while News is hidden (`NEWS_ENABLED=false`, filtered in primary-nav.ts)
// and 5 when it is on. Its height — `pt-2`, a 32px pill, a gap, the micro
// line, the item's `py-1`, safe-bottom and the rule — is what
// `--bottomnav-h` in styles.css computes, term for term (76px in French,
// 82px in Arabic, whose micro line is taller). Change one, change both.
//
// The pill is ONE element that slides to the active item when the route
// changes, rather than a background that appears on one item and vanishes from
// another. It is placed from the active icon's measured position, so it follows
// the layout in either direction and at any width. Until it has been measured
// (the server render, the first paint) the active item paints its own pill, so
// the bar is right with no script. The newly active icon pops once.
//
// RTL-safe (no physical utilities in the markup; the pill's offsets are
// measured, so they are right in both directions) and reduced-motion-safe (the
// global media query in styles.css neutralises the transitions).

import { Link, useRouterState } from "@tanstack/react-router";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { ui } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import { useManagerCardLive } from "@/services/manager-card-status";
import { isPrimaryRouteActive, usePrimaryNavItems } from "./primary-nav";

/**
 * Where the pill was and which tab was active when the last bar went away.
 * Each page renders its own bar, so a bar that is new on a page starts here
 * and slides on from where the last one left off. Written only in effects,
 * so the server (which shares this module between requests) never reads it
 * and the first client render matches the server's.
 */
let lastPlacement: { to: string; x: number; y: number } | null = null;

/** When the last pop began, so a bar drawn again part-way through carries on. */
let lastPop: { to: string; at: number } | null = null;
const POP_MS = 320;

export function BottomNav() {
  const { t, lang } = useI18n();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  // Today's five items, or Curva' while it is live (src/lib/feature-flags.ts).
  const primaryNavItems = usePrimaryNavItems();
  const curvaLive = useManagerCardLive();

  const activeTo = primaryNavItems.find((item) =>
    isPrimaryRouteActive(pathname, item.to, curvaLive),
  )?.to;
  const rowRef = useRef<HTMLDivElement>(null);
  const iconRefs = useRef(new Map<string, HTMLSpanElement>());
  // Where the sliding pill sits, from the active icon. Null until measured.
  const [slide, setSlide] = useState<{ x: number; y: number } | null>(() =>
    lastPlacement ? { x: lastPlacement.x, y: lastPlacement.y } : null,
  );
  // Slides are switched on only once the pill has somewhere to slide from, so
  // it is never seen travelling in from the corner.
  const [settled, setSettled] = useState(() => lastPlacement !== null);
  const pillRef = useRef<HTMLSpanElement>(null);
  // The icon that just became active, for the one-off pop; `elapsed` is how far
  // into it a bar that was drawn again part-way through already is.
  const [popped, setPopped] = useState<{ to: string; elapsed: number } | null>(() =>
    lastPop && lastPop.to === lastPlacement?.to && performance.now() - lastPop.at < POP_MS
      ? { to: lastPop.to, elapsed: performance.now() - lastPop.at }
      : null,
  );
  const previousActive = useRef(lastPlacement?.to);

  const measure = useCallback(() => {
    const icon = activeTo ? iconRefs.current.get(activeTo) : undefined;
    if (!icon) {
      setSlide(null);
      return;
    }
    const x = icon.offsetLeft;
    const y = icon.offsetTop;
    // Let the pill's current spot be computed before it is given the new one,
    // or a bar that has just mounted would jump instead of slide.
    pillRef.current?.getBoundingClientRect();
    setSlide((was) => (was && was.x === x && was.y === y ? was : { x, y }));
  }, [activeTo]);

  // `lang` is a dependency: the Arabic micro line is taller, which moves the pill.
  useLayoutEffect(measure, [measure, lang]);

  useEffect(() => {
    const row = rowRef.current;
    if (!row || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(row);
    return () => observer.disconnect();
  }, [measure]);

  useEffect(() => {
    if (!slide || settled) return;
    const frame = requestAnimationFrame(() => setSettled(true));
    return () => cancelAnimationFrame(frame);
  }, [slide, settled]);

  useEffect(() => {
    if (lastPlacement && previousActive.current !== activeTo && activeTo) {
      lastPop = { to: activeTo, at: performance.now() };
      setPopped({ to: activeTo, elapsed: 0 });
    }
    previousActive.current = activeTo;
  }, [activeTo]);

  useEffect(() => {
    if (activeTo && slide) lastPlacement = { to: activeTo, x: slide.x, y: slide.y };
  }, [activeTo, slide]);

  return (
    <nav
      aria-label={t("nav.primary")}
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 md:hidden",
        ui.surface.bar,
        ui.rule.blockStart,
        ui.safe.bottom,
        "pt-2",
        ui.shadow.raised,
      )}
      // Held still while the page behind it changes (see the view transitions
      // in styles.css), so the bar does not flicker between pages.
      style={{ viewTransitionName: "bottom-nav" }}
    >
      {/* Under 360px the bar gives its side padding to the items: at 320px
          the Arabic "الملف الشخصي" (77px) had 72px and lost its last letter. */}
      <div
        ref={rowRef}
        className="relative mx-auto flex max-w-2xl items-stretch justify-between px-2 max-[359px]:px-1"
      >
        {slide ? (
          <span
            aria-hidden
            ref={pillRef}
            className={cn("pointer-events-none absolute h-8 w-14", ui.radius.full)}
            style={{
              left: 0,
              top: 0,
              transform: `translate(${slide.x}px, ${slide.y}px)`,
              backgroundImage: "var(--ui-grad-action)",
              transition: settled
                ? "transform var(--duration-sheet) var(--ease-emphasized)"
                : "none",
            }}
          />
        ) : null}
        {primaryNavItems.map((item) => {
          const active = isPrimaryRouteActive(pathname, item.to, curvaLive);
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              aria-current={active ? "page" : undefined}
              aria-label={t(item.labelKey)}
              className={cn(
                "group flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-0.5 py-1 max-[359px]:px-0",
                ui.space.tap,
                ui.radius.card,
                ui.text.micro,
                ui.focus,
                // Gives under the finger, like every other control.
                "press",
                active
                  ? cn(ui.tone.default, "[font-weight:var(--ui-weight-heavy)]")
                  : cn(
                      ui.tone.muted,
                      "[font-weight:var(--ui-weight-strong)]",
                      // BG-0083: this hover wrote `--ui-ink` — a fill — as
                      // the text colour. The hover moves to the full-strength
                      // foreground instead, the same one the active label uses.
                      "hover:text-[color:var(--ui-on-surface)]",
                    ),
              )}
            >
              {/* The pill behind the icon. The gradient is a background IMAGE,
                  so it is set inline from the token (a class cannot name a
                  `var()` image and stay a literal Tailwind can scan). The
                  icon on it is ink-deep, dark in both themes like the
                  gradient under it: 12.4:1 light, 10.7:1 dark. */}
              <span
                aria-hidden
                ref={(node) => {
                  if (node) iconRefs.current.set(item.to, node);
                  else iconRefs.current.delete(item.to);
                }}
                className={cn(
                  "relative grid h-8 w-14 shrink-0 place-items-center",
                  ui.radius.full,
                  "transition-colors duration-[var(--duration-quick)] ease-[var(--ease-standard)]",
                  active
                    ? "text-[color:var(--ui-ink-deep)]"
                    : "group-hover:bg-[color:var(--ui-surface-sunken)] group-active:bg-[color:var(--ui-surface-sunken)]",
                )}
                style={active && !slide ? { backgroundImage: "var(--ui-grad-action)" } : undefined}
              >
                <span
                  className={cn("inline-flex", active && popped?.to === item.to && "tab-pop")}
                  style={
                    active && popped?.to === item.to && popped.elapsed > 0
                      ? { animationDelay: `-${Math.round(popped.elapsed)}ms` }
                      : undefined
                  }
                >
                  <Icon className="h-5 w-5 shrink-0" />
                </span>
              </span>
              {/* BG-0124 — no local `leading-*` here. A `leading-none` on
                  this span, combined with `truncate`, once cut 2px off the
                  Latin descender in "Fantasy" and a third of the Arabic ink.
                  `ui.text.micro` already sets the leading for both scripts. */}
              <span className="max-w-full truncate">{t(item.labelKey)}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
