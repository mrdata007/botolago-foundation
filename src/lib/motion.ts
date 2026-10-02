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

/** Where an item sits inside its container, in layout pixels. */
export type Place = { readonly x: number; readonly y: number };
export type Places = ReadonlyMap<string, Place>;

/**
 * How far each item must start from its new place so it appears to slide from
 * its old one: `previous - next`, for items in both lists that actually moved
 * by a pixel or more. An item that is new, gone, or has not moved gets no entry.
 */
export function flipOffsets(previous: Places, next: Places): Map<string, Place> {
  const offsets = new Map<string, Place>();
  for (const [key, place] of next) {
    const before = previous.get(key);
    if (before === undefined) continue;
    const x = before.x - place.x;
    const y = before.y - place.y;
    if (Math.abs(x) >= 1 || Math.abs(y) >= 1) offsets.set(key, { x, y });
  }
  return offsets;
}

/** The translation an element is currently drawn with (an animation in flight). */
function currentTranslation(element: HTMLElement): Place {
  const transform = getComputedStyle(element).transform;
  if (!transform || transform === "none") return { x: 0, y: 0 };
  const matrix = new DOMMatrixReadOnly(transform);
  return { x: matrix.e, y: matrix.f };
}

/**
 * Slides the items of a container to their new places when their order
 * changes: rows of a table, players on a pitch.
 *
 * Give the container ref to the element holding the items and mark each item
 * with `data-flip-key={stableId}` (an id, not the item's index). Positions are
 * kept relative to the container and with any slide in flight taken out, so
 * scrolling the page, or an earlier slide, never throws a later one off. They
 * are recorded after every render, and a slide plays only on a render in which
 * `order` changed.
 *
 * Pass `resetKey` (a season, a gameweek) so a switch to a different list does
 * not slide: the items are different, not re-ordered.
 */
export function useFlip<T extends HTMLElement>(order: readonly string[], resetKey?: string) {
  const container = useRef<T | null>(null);
  const places = useRef<Places>(new Map());
  const last = useRef<{ signature: string; reset: string | undefined } | null>(null);
  const signature = order.join("\u0000");

  const measure = () => {
    const root = container.current;
    const found = new Map<string, Place>();
    const items = new Map<string, HTMLElement>();
    if (!root) return { found, items };
    const origin = root.getBoundingClientRect();
    for (const item of root.querySelectorAll<HTMLElement>("[data-flip-key]")) {
      const key = item.dataset.flipKey;
      if (!key) continue;
      const rect = item.getBoundingClientRect();
      const drawn = currentTranslation(item);
      found.set(key, { x: rect.left - origin.left - drawn.x, y: rect.top - origin.top - drawn.y });
      items.set(key, item);
    }
    return { found, items };
  };

  useLayoutEffect(() => {
    const { found, items } = measure();
    const before = last.current;
    const previous = places.current;
    places.current = found;
    last.current = { signature, reset: resetKey };
    if (
      !before ||
      before.signature === signature ||
      before.reset !== resetKey ||
      prefersReducedMotion() ||
      typeof Element.prototype.animate !== "function"
    ) {
      return;
    }
    const duration = tokenMs("--duration-route", 260);
    for (const [key, offset] of flipOffsets(previous, found)) {
      items
        .get(key)
        ?.animate(
          [
            { transform: `translate(${offset.x}px, ${offset.y}px)` },
            { transform: "translate(0, 0)" },
          ],
          { duration, easing: "cubic-bezier(0.2, 0.7, 0.2, 1)" },
        );
    }
  });

  // A resize moves the items without a render: keep the record true to it.
  useEffect(() => {
    const root = container.current;
    if (!root || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      places.current = measure().found;
    });
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  return container;
}

/**
 * True for `holdMs` after `value` changes, and never on the first render. The
 * moment to play a one-off animation for a figure that changed while the page
 * was open (a score, a rank). False under reduced motion.
 */
export function useJustChanged<T>(value: T, holdMs = 700): boolean {
  const [changed, setChanged] = useState(false);
  const previous = useRef(value);

  useEffect(() => {
    const moved = previous.current !== value;
    previous.current = value;
    if (!moved || prefersReducedMotion()) return;
    setChanged(true);
    const timer = setTimeout(() => setChanged(false), holdMs);
    return () => clearTimeout(timer);
  }, [value, holdMs]);

  return changed;
}

/**
 * True for `holdMs` after `flag` turns from false to true, and never on the
 * first render: a card that is already saved, or a result that is already in,
 * when the page opens does not celebrate. False under reduced motion.
 */
export function useJustTurnedOn(flag: boolean, holdMs = 900): boolean {
  const [on, setOn] = useState(false);
  const previous = useRef(flag);

  useEffect(() => {
    const turnedOn = flag && !previous.current;
    previous.current = flag;
    if (!turnedOn || prefersReducedMotion()) return;
    setOn(true);
    const timer = setTimeout(() => setOn(false), holdMs);
    return () => clearTimeout(timer);
  }, [flag, holdMs]);

  return on;
}

const MINUTE_MS = 60_000;

/**
 * The match minute to show, given the last one the data gave and how long ago
 * it arrived: that minute, plus one if a whole minute has passed without a
 * refresh. Never more than `maxExtra` ahead, so a stalled feed is never
 * dressed up as a clock running free.
 */
export function tickedMinute(
  base: number | undefined,
  receivedAt: number,
  now: number,
  maxExtra = 1,
): number | undefined {
  if (base === undefined) return undefined;
  const extra = Math.floor((now - receivedAt) / MINUTE_MS);
  return base + Math.min(maxExtra, Math.max(0, extra));
}

/**
 * The live minute, ticking on between data refreshes: it moves up by one when
 * a minute has gone by with no new figure, and snaps to the data the moment a
 * new minute arrives. It starts on the data's own minute (so the server render
 * and first paint agree) and only ticks while `running` (live play, not the
 * interval) and the tab is visible.
 */
export function useTickingMinute(minute: number | undefined, running: boolean): number | undefined {
  const [extra, setExtra] = useState(0);
  const receivedAt = useRef(0);

  useEffect(() => {
    receivedAt.current = Date.now();
    setExtra(0);
  }, [minute]);

  useEffect(() => {
    if (!running || minute === undefined) return;
    const timer = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      const next = (tickedMinute(minute, receivedAt.current, Date.now()) ?? minute) - minute;
      setExtra((was) => (was === next ? was : next));
    }, 15_000);
    return () => clearInterval(timer);
  }, [minute, running]);

  return minute === undefined ? undefined : minute + (running ? extra : 0);
}

/**
 * The two halves of the live progress bar, each 0..1 full: the first half
 * fills over minutes 0-45, the second over 45-90. At half-time the first is
 * full and the second empty, whatever the minute says.
 */
export function halfProgress(
  minute: number | undefined,
  halfTime: boolean,
): { first: number; second: number } {
  if (halfTime) return { first: 1, second: 0 };
  const m = Math.max(0, minute ?? 0);
  return {
    first: Math.min(1, m / 45),
    second: Math.min(1, Math.max(0, (m - 45) / 45)),
  };
}

export type RevealState = "static" | "armed" | "played";

/**
 * A bar or ring that fills once, when it is first scrolled into view.
 *
 * It starts `static`: finished, which is what the server sends and what stays
 * if scripts never run, or the reader wants less motion, or there is no
 * `IntersectionObserver`. Once on the page it is `armed` (empty, before the
 * first paint) until at least 40% of it is on screen, then `played` (filling),
 * and never armed again.
 */
export function useRevealOnView<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [state, setState] = useState<RevealState>("static");

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || prefersReducedMotion() || typeof IntersectionObserver === "undefined") return;
    setState("armed");
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setState("played");
        observer.disconnect();
      },
      { threshold: 0.4 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, state] as const;
}

/**
 * How far a card tilts for a pointer at (`x`, `y`) in a box of `width` by
 * `height`: up to `max` degrees either way, none at the centre. The edge the
 * pointer is near dips towards it.
 */
export function tiltAngles(
  x: number,
  y: number,
  width: number,
  height: number,
  max = 6,
): { rotateX: number; rotateY: number } {
  if (width <= 0 || height <= 0) return { rotateX: 0, rotateY: 0 };
  const clamp = (value: number) => Math.min(1, Math.max(-1, value));
  const nx = clamp((x / width - 0.5) * 2);
  const ny = clamp((y / height - 0.5) * 2);
  const round = (value: number) => Math.round(value * 100) / 100 || 0;
  return { rotateX: round(-ny * max), rotateY: round(nx * max) };
}

/**
 * Which cards arrived at the top of a list since the last one: the ids that
 * now come before what used to be the first. Nothing if the list was empty,
 * or if its old first item is gone (a different list altogether, such as
 * another filter), and nothing for older items added at the end (load more).
 */
export function newAtTop(previous: readonly string[], next: readonly string[]): string[] {
  const first = previous[0];
  if (first === undefined) return [];
  const at = next.indexOf(first);
  return at > 0 ? next.slice(0, at).filter((id) => !previous.includes(id)) : [];
}

/** The ids that have arrived at the top of `ids` while the page was open. */
export function useArrivals(ids: readonly string[]): ReadonlySet<string> {
  const previous = useRef(ids);
  const [arrived, setArrived] = useState<ReadonlySet<string>>(new Set());
  const signature = ids.join("\u0000");

  // Before paint, so a new card is never drawn once in its final place first.
  useLayoutEffect(() => {
    const fresh = newAtTop(previous.current, ids);
    previous.current = ids;
    if (fresh.length === 0 || prefersReducedMotion()) return;
    setArrived((was) => new Set([...was, ...fresh]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  return arrived;
}
