import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ComponentPropsWithoutRef,
  type ReactNode,
  type Ref,
} from "react";

import { prefersReducedMotion } from "@/lib/motion";
import type { Bezier, DurationName, ExitMode, ExitTag } from "./motion-lib";

/**
 * Things that leave (docs/engineering/MOTION_PLAN_4.md).
 *
 * The CSS toolkit in `styles.css` can animate an element that arrives; it
 * cannot animate one React has already removed. This module is the only place
 * that imports `motion/react`, so screens never pull the library in directly
 * and the bundle only ever carries `LazyMotion` (features loaded on demand, `domMin`) + `m.*` (the
 * full `motion.*` components bundle every feature, and `strict` makes one
 * throw).
 *
 * - Durations and easings come from the motion tokens (`--duration-sheet`,
 *   `--ease-standard`, ...). The easings are written out as arrays here
 *   because Motion wants numbers; they must match `styles.css`.
 * - Under reduced motion a leaving element goes at once: it is given no exit
 *   at all (`MotionConfig reducedMotion="user"` alone would keep fading
 *   opacity, and would not touch height).
 * - The server renders plain, finished markup: `ExitPresence` is
 *   `initial={false}`, so nothing starts from `opacity: 0` on first paint.
 * - An element that is leaving is `aria-hidden` and `inert`, so focus and
 *   assistive technology never land on something that is on its way out.
 */

/** `--ease-standard` in styles.css. */
export const EASE_STANDARD = [0.2, 0.7, 0.2, 1] as const;
/** `--ease-emphasized` in styles.css. */
export const EASE_EMPHASIZED = [0.2, 0.9, 0.1, 1] as const;

export type { ExitMode };

type Lib = typeof import("./motion-lib");

let loaded: Lib | null = null;
let pending: Promise<Lib> | null = null;
let failed = false;

/**
 * Fetches Motion (its own chunk) once, after the first paint of the first
 * `ExitPresence`. Until it has arrived, and always under reduced motion, the
 * wrappers draw plain elements: a child that is removed in that time is
 * simply gone, so nothing is ever left stuck on screen.
 */
function loadMotion(): Promise<Lib> {
  pending ??= import("./motion-lib").then((module) => (loaded = module));
  return pending;
}

const LibContext = createContext<Lib | null>(null);

/**
 * Wraps the children that may leave. Keep it mounted and put the conditional
 * (or the `.map`) inside it: an element removed from inside plays its exit.
 */
export function ExitPresence({
  children,
  mode = "sync",
}: {
  children?: ReactNode;
  mode?: ExitMode;
}) {
  const reduced = prefersReducedMotion();
  const [lib, setLib] = useState<Lib | null>(loaded);
  useEffect(() => {
    if (reduced || lib || failed) return;
    let live = true;
    loadMotion().then(
      (module) => {
        if (live) setLib(module);
      },
      // Offline, or the chunk is gone: stay with plain elements, which still
      // leave at once. Not retried, so a bad network does not loop.
      () => {
        failed = true;
      },
    );
    return () => {
      live = false;
    };
  }, [reduced, lib]);

  // Reduced motion: no presence at all, so a removed child is gone in the
  // same commit instead of a frame later.
  if (reduced || !lib) {
    return <LibContext.Provider value={null}>{children}</LibContext.Provider>;
  }
  return (
    <LibContext.Provider value={lib}>
      <lib.Presence mode={mode}>{children}</lib.Presence>
    </LibContext.Provider>
  );
}

type ExitElementProps = ComponentPropsWithoutRef<"div"> & {
  /** Handed on to the element: `AnimatePresence` needs it to pop a child out. */
  ref?: Ref<HTMLElement>;
  /** The element drawn; the same props pass through. */
  as?: ExitTag;
};

function ExitItem({
  as: Tag = "div",
  exitTo,
  enterFrom,
  duration,
  ease,
  ...rest
}: ExitElementProps & {
  exitTo: Record<string, number>;
  enterFrom?: Record<string, number>;
  duration: DurationName;
  ease: Bezier;
}) {
  const lib = useContext(LibContext);
  if (!lib) {
    const Plain = Tag as "div";
    return <Plain {...(rest as ComponentPropsWithoutRef<"div">)} />;
  }
  return (
    <lib.Item
      {...(rest as object)}
      as={Tag}
      exitTo={exitTo}
      enterFrom={enterFrom}
      duration={duration}
      ease={ease}
    />
  );
}

/**
 * Fades out and closes up: opacity and height go to nothing (and the row's
 * top rule with them), so the list below slides up instead of jumping.
 * Only for a direct child of `ExitPresence`. Keep any `enter-rise` arrival on
 * an inner element: a CSS animation with a fill holds `opacity` and would
 * hide this one's fade.
 */
export function ExitCollapse(props: ExitElementProps) {
  return (
    <ExitItem
      {...props}
      exitTo={{ opacity: 0, height: 0, borderTopWidth: 0 }}
      duration="sheet"
      ease={EASE_STANDARD}
    />
  );
}

/**
 * Fades out with a slight shrink, in place (no collapse). With `enter` it
 * also fades in from the same state, so a keyed swap cross-fades. Only for a
 * direct child of `ExitPresence`.
 */
export function ExitFade({
  enter = false,
  duration = "quick",
  ...props
}: ExitElementProps & {
  /** Fade in as well, when it mounts after the first render. */
  enter?: boolean;
  duration?: DurationName;
}) {
  return (
    <ExitItem
      {...props}
      exitTo={{ opacity: 0, scale: 0.94 }}
      enterFrom={enter ? { opacity: 0, scale: 0.94 } : undefined}
      duration={duration}
      ease={EASE_EMPHASIZED}
    />
  );
}

/**
 * One slot whose content is replaced (a player card for an empty slot and
 * back). The old content fades out where it stood, out of the flow, while the
 * new fades in, so the slot never changes size. Change `swapKey` to swap.
 */
export function ExitSwap({
  swapKey,
  children,
  className,
}: {
  swapKey: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={className ? `relative ${className}` : "relative"}>
      <ExitPresence mode="popLayout">
        <ExitFade key={swapKey} enter duration="sheet">
          {children}
        </ExitFade>
      </ExitPresence>
    </div>
  );
}
