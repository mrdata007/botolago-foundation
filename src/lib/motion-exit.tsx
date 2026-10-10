import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type ReactNode,
  type Ref,
} from "react";

import { prefersReducedMotion } from "@/lib/motion";
import type { Bezier, DurationName, ExitMode, ExitTag } from "./motion-lib";
import { loadMotion, loadedMotion, motionFailed, type MotionLib } from "./motion-loader";

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

type Lib = MotionLib;

type Registry = {
  lib: Lib | null;
  /** The elements this presence draws while still plain (to tell when a swap is safe). */
  nodes: Set<HTMLElement>;
};
const LibContext = createContext<Registry>({ lib: null, nodes: new Set() });

/**
 * Whether the plain tree can be swapped for the animated one without anyone
 * noticing: focus is not inside it, nothing in it is mid-animation, and (with
 * `idleOnly`) it is not showing anything at all (a search panel that is open).
 */
function swapIsSafe(nodes: ReadonlySet<HTMLElement>, idleOnly: boolean): boolean {
  if (nodes.size === 0) return true;
  if (idleOnly) return false;
  const active = typeof document === "undefined" ? null : document.activeElement;
  for (const node of nodes) {
    if (!node.isConnected) continue;
    if (active && node.contains(active)) return false;
    if (
      typeof node.getAnimations === "function" &&
      node.getAnimations({ subtree: true }).length > 0
    )
      return false;
  }
  return true;
}

/**
 * Wraps the children that may leave. Keep it mounted and put the conditional
 * (or the `.map`) inside it: an element removed from inside plays its exit.
 *
 * Motion arrives after the page does. The swap from plain to animated remounts
 * the children, so it waits until that cannot be seen: not while focus is
 * inside, not while something in it is animating, and with `idleOnly` not
 * while it shows anything (checked every 200ms).
 */
export function ExitPresence({
  children,
  mode = "sync",
  idleOnly = false,
}: {
  children?: ReactNode;
  mode?: ExitMode;
  idleOnly?: boolean;
}) {
  const reduced = prefersReducedMotion();
  const [lib, setLib] = useState<Lib | null>(loadedMotion());
  const nodes = useRef(new Set<HTMLElement>()).current;
  useEffect(() => {
    if (reduced || lib || motionFailed()) return;
    let live = true;
    let timer: ReturnType<typeof setInterval> | undefined;
    loadMotion().then(
      (module) => {
        if (!live) return;
        const trySwap = () => {
          if (!swapIsSafe(nodes, idleOnly)) return false;
          setLib(module);
          return true;
        };
        if (!trySwap()) {
          timer = setInterval(() => {
            if (trySwap()) clearInterval(timer);
          }, 200);
        }
      },
      () => undefined,
    );
    return () => {
      live = false;
      if (timer) clearInterval(timer);
    };
  }, [reduced, lib, nodes, idleOnly]);

  // Reduced motion: no presence at all, so a removed child is gone in the
  // same commit instead of a frame later.
  if (reduced || !lib) {
    return <LibContext.Provider value={{ lib: null, nodes }}>{children}</LibContext.Provider>;
  }
  return (
    <LibContext.Provider value={{ lib, nodes }}>
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
  const { lib, nodes } = useContext(LibContext);
  if (!lib) {
    const Plain = Tag as "div";
    const { ref: outer, ...plain } = rest as ComponentPropsWithoutRef<"div"> & {
      ref?: Ref<HTMLElement>;
    };
    return (
      <Plain
        {...plain}
        ref={(node: HTMLDivElement | null) => {
          if (!node) return;
          nodes.add(node);
          if (typeof outer === "function") outer(node);
          else if (outer) (outer as { current: HTMLElement | null }).current = node;
          return () => {
            nodes.delete(node);
            if (typeof outer === "function") outer(null);
            else if (outer) (outer as { current: HTMLElement | null }).current = null;
          };
        }}
      />
    );
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
