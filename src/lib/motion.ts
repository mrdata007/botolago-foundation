import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";

/**
 * Shared helpers for the app's motion (docs/engineering/MOTION_PLAN.md).
 *
 * The CSS side — `enter-rise`, `stagger`, `pop`, `flash-up`, `flash-down`,
 * `wiggle`, `press-tile` — lives in `styles.css` and is cut short by the
 * global reduced-motion rule. Anything driven from JavaScript is not covered
 * by that rule, so every helper here asks `prefersReducedMotion()` itself and
 * jumps straight to the end state.
 *
 * The maths is in plain functions so it is tested without a browser; the hooks
 * are thin wrappers.
 */

/**
 * Whether the reader asked for less motion. On the server it answers `true`,
 * so the server never renders a half-animated state and the first client render
 * (which must match it) starts from the finished one.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** A motion token's value in milliseconds, read from the page, or `fallback`. */
export function tokenMs(name: string, fallback: number): number {
  if (typeof document === "undefined") return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const value = Number.parseFloat(raw);
  if (!Number.isFinite(value)) return fallback;
  if (raw.endsWith("ms")) return value;
  if (raw.endsWith("s")) return value * 1000;
  return fallback;
}

/**
 * The inline style that places an item in a staggered list: pair it with the
 * `enter-rise stagger` classes. A refresh that keeps an item's key does not
 * replay it; only an item that mounts does.
 */
export function staggerStyle(index: number): CSSProperties {
  return { "--i": index } as CSSProperties;
}

/** Slows quickly, then settles: the count-up's easing (ease-out cubic). */
export function easeOutCubic(progress: number): number {
  const p = Math.min(1, Math.max(0, progress));
  return 1 - (1 - p) ** 3;
}

/**
 * The number to show `progress` (0..1) of the way from `from` to `to`.
 * Whole numbers stay whole while counting; at 1 it is exactly `to`, so the
 * count never ends a hair off.
 */
export function countUpValue(from: number, to: number, progress: number): number {
  if (progress >= 1 || from === to) return to;
  const value = from + (to - from) * easeOutCubic(progress);
  return Number.isInteger(from) && Number.isInteger(to) ? Math.round(value) : value;
}

/**
 * The number on screen, counting to `value` whenever it changes. The first
 * value is shown as it is (a page does not count up from zero on load: only a
 * change the reader can see happening is animated).
 */
export function useCountUp(value: number, durationMs?: number): number {
  const [shown, setShown] = useState(value);
  const shownRef = useRef(value);
  shownRef.current = shown;

  useEffect(() => {
    if (shownRef.current === value) return;
    if (prefersReducedMotion()) {
      setShown(value);
      return;
    }
    const from = shownRef.current;
    const duration = durationMs ?? tokenMs("--duration-hero", 420);
    const started = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const progress = duration <= 0 ? 1 : (now - started) / duration;
      setShown(countUpValue(from, value, progress));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, durationMs]);

  return shown;
}

export type ChangeDirection = "up" | "down";

/** Which way a number moved, or null when it did not (or either end is unknown). */
export function changeDirection(
  previous: number | null | undefined,
  next: number | null | undefined,
): ChangeDirection | null {
  if (previous == null || next == null || previous === next) return null;
  return next > previous ? "up" : "down";
}

/**
 * Which flash a change earns: green when it is good news, red when it is not.
 * `better` says which way is good — a score going up is, a rank number going
 * up (12th to 14th) is not. Null when nothing moved.
 */
export function flashClass(
  moved: ChangeDirection | null,
  better: "higher" | "lower" = "higher",
): "flash-up" | "flash-down" | null {
  if (moved === null) return null;
  return (moved === "up") === (better === "higher") ? "flash-up" : "flash-down";
}

/**
 * The direction a number just moved, for `holdMs` after it changed, then null.
 * It is null on the first render and under reduced motion. Whether "up" is
 * good news is the caller's call (a rank number going up is a worse rank).
 */
export function useChangeFlash(
  value: number | null | undefined,
  holdMs = 1000,
): ChangeDirection | null {
  const [direction, setDirection] = useState<ChangeDirection | null>(null);
  const previous = useRef(value);

  useEffect(() => {
    const moved = changeDirection(previous.current, value);
    previous.current = value;
    if (!moved || prefersReducedMotion()) return;
    setDirection(moved);
    const timer = setTimeout(() => setDirection(null), holdMs);
    return () => clearTimeout(timer);
  }, [value, holdMs]);

  return direction;
}

/** Where a row was and where it is now, on the vertical axis. */
export type RowPositions = ReadonlyMap<string, number>;

/**
 * How far each row must start from its new place so it appears to slide from
 * its old one: `previous - next`, for rows in both lists that actually moved.
 * A row that is new, gone, or has not moved gets no entry.
 */
export function flipOffsets(previous: RowPositions, next: RowPositions): Map<string, number> {
  const offsets = new Map<string, number>();
  for (const [key, top] of next) {
    const before = previous.get(key);
    if (before === undefined) continue;
    const delta = before - top;
    if (Math.abs(delta) >= 1) offsets.set(key, delta);
  }
  return offsets;
}

/**
 * Slides the rows of a list to their new places when their order changes.
 *
 * Give the container ref to the element holding the rows and mark each row
 * with `data-flip-key={stableId}` (an id, not the row's index). After every
 * render in which `order` changed, each row that moved is put back where it
 * was and let go, and it glides to its new place.
 *
 * Pass `resetKey` (a season, a gameweek) so a switch to a different table does
 * not slide: the rows are different, not re-ordered.
 */
export function useFlip<T extends HTMLElement>(order: readonly string[], resetKey?: string) {
  const container = useRef<T | null>(null);
  const positions = useRef<RowPositions>(new Map());
  const lastReset = useRef(resetKey);
  const signature = order.join("\u0000");

  useLayoutEffect(() => {
    const root = container.current;
    if (!root) return;
    const next = new Map<string, number>();
    const rows = new Map<string, HTMLElement>();
    for (const row of root.querySelectorAll<HTMLElement>("[data-flip-key]")) {
      const key = row.dataset.flipKey;
      if (!key) continue;
      next.set(key, row.getBoundingClientRect().top);
      rows.set(key, row);
    }
    const sameTable = lastReset.current === resetKey;
    lastReset.current = resetKey;
    const previous = positions.current;
    positions.current = next;
    if (!sameTable || prefersReducedMotion() || typeof Element.prototype.animate !== "function") {
      return;
    }
    const duration = tokenMs("--duration-route", 260);
    for (const [key, delta] of flipOffsets(previous, next)) {
      rows
        .get(key)
        ?.animate([{ transform: `translateY(${delta}px)` }, { transform: "translateY(0)" }], {
          duration,
          easing: "cubic-bezier(0.2, 0.7, 0.2, 1)",
        });
    }
  }, [signature, resetKey]);

  return container;
}
