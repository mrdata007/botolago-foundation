import { prefersReducedMotion } from "./motion";
import { SAME_LEVEL_ROOTS } from "./page-transition";

/**
 * Slide: the page arriving from the side of the tab that was tapped
 * (docs/engineering/TAB_SLIDE_STRETCH.md, modelled on React Bits' Animated
 * Content).
 *
 * Moves between same-level destinations run no view transition
 * (page-transition.ts, NAVIGATION_SPEED.md), so the new page shows as soon as
 * it is ready. Slide keeps that: nothing holds the old page. When such a move
 * starts, the router subscription arms a direction here; the first page frame
 * to mount afterwards takes it and animates itself in (`useTabSlide`). Taken
 * once, so a frame that mounts later (a loading screen's page replacing it, a
 * remount) does not slide a second time, and dropped after a moment, so a
 * frame that mounts long after the tap never does.
 */

/** Where the bar's sections stand, left to right in French. Curva and Pépites share a slot. */
const SECTION_ORDER: Record<string, number> = {
  "/": 0,
  "/news": 1,
  "/fantasy": 2,
  "/matches": 3,
  "/pepites": 4,
  "/curva": 4,
  "/profile": 5,
};

/** The section tabs inside Matches, in their order: Calendrier, Classement, Pronostics. */
const MATCHES_TABS: Record<string, number> = {
  "/matches": 0,
  "/matches/standings": 1,
  "/pronostics": 2,
};

function normalise(path: string): string {
  return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}

/**
 * Which way the new page arrives: 1 when the tapped destination is further
 * along (in reading order), -1 when it is earlier, 0 for no slide (not a move
 * between two same-level destinations, or the same place).
 */
export function tabSlideDirection(fromPath: string, toPath: string): -1 | 0 | 1 {
  const from = normalise(fromPath);
  const to = normalise(toPath);
  if (from === to) return 0;
  if (!SAME_LEVEL_ROOTS.includes(from) || !SAME_LEVEL_ROOTS.includes(to)) return 0;
  const a = from in MATCHES_TABS && to in MATCHES_TABS ? MATCHES_TABS[from] : sectionIndex(from);
  const b = from in MATCHES_TABS && to in MATCHES_TABS ? MATCHES_TABS[to] : sectionIndex(to);
  if (a === undefined || b === undefined || a === b) return 0;
  return b > a ? 1 : -1;
}

function sectionIndex(path: string): number | undefined {
  return path in MATCHES_TABS ? SECTION_ORDER["/matches"] : SECTION_ORDER[path];
}

/** How long an armed slide waits for a frame to take it. */
export const TAB_SLIDE_WINDOW_MS = 1500;

let armed: { direction: 1 | -1; at: number } | null = null;

/** Called when a navigation starts: arms the slide for the frame about to mount, or clears it. */
export function armTabSlide(
  fromPath: string | undefined,
  toPath: string,
  now: number = Date.now(),
  reducedMotion: boolean = prefersReducedMotion(),
): void {
  const direction =
    fromPath === undefined || reducedMotion ? 0 : tabSlideDirection(fromPath, toPath);
  armed = direction === 0 ? null : { direction, at: now };
}

/** The armed direction, once: a second call, or one after the window, gets 0. */
export function takeTabSlide(now: number = Date.now()): -1 | 0 | 1 {
  const taken = armed;
  armed = null;
  if (!taken || now - taken.at > TAB_SLIDE_WINDOW_MS) return 0;
  return taken.direction;
}

/** The keyframes: 40 px toward the side the tab is on, transparent, to rest. */
export function tabSlideKeyframes(direction: 1 | -1, rtl: boolean): Keyframe[] {
  const offset = direction * (rtl ? -1 : 1) * 40;
  return [
    { opacity: 0, left: `${offset}px` },
    { opacity: 1, left: "0px" },
  ];
}

/** The page frame's side of it: slide `element` in if a slide is armed. */
export function playTabSlide(element: HTMLElement | null): void {
  const direction = takeTabSlide();
  if (!element || direction === 0 || typeof element.animate !== "function") return;
  // `left`, not a transform: a transform would make the frame the containing
  // block of any bar fixed inside the page, and carry that bar along.
  element.animate(tabSlideKeyframes(direction, document.documentElement.dir === "rtl"), {
    duration: 300,
    easing: "cubic-bezier(0.22, 1, 0.36, 1)",
  });
}
