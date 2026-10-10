import {
  AnimatePresence,
  LazyMotion,
  MotionConfig,
  domMin,
  m,
  useIsPresent,
  type HTMLMotionProps,
} from "motion/react";
import type { ReactNode } from "react";

import { prefersReducedMotion, tokenMs } from "@/lib/motion";

/**
 * Things that leave (docs/engineering/MOTION_PLAN_4.md).
 *
 * The CSS toolkit in `styles.css` can animate an element that arrives; it
 * cannot animate one React has already removed. This module is the only place
 * that imports `motion/react`, so screens never pull the library in directly
 * and the bundle only ever carries `LazyMotion` + `domMin` + `m.*` (the
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

export type ExitMode = "sync" | "popLayout" | "wait";

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
  return (
    <LazyMotion features={domMin} strict>
      <MotionConfig reducedMotion="user">
        {/* Reduced motion: no presence at all, so a removed child is gone in
            the same commit instead of a frame later. */}
        {prefersReducedMotion() ? (
          children
        ) : (
          <AnimatePresence initial={false} mode={mode}>
            {children}
          </AnimatePresence>
        )}
      </MotionConfig>
    </LazyMotion>
  );
}

type ExitTag = "div" | "li" | "ul";

const TAGS = { div: m.div, li: m.li, ul: m.ul } as const;

type ExitElementProps = Omit<
  HTMLMotionProps<"div">,
  "initial" | "animate" | "exit" | "transition" | "variants" | "layout"
> & {
  /** The element drawn; the same props pass through. */
  as?: ExitTag;
};

type DurationName = "quick" | "sheet";

const DURATION_TOKEN: Record<DurationName, { token: string; fallback: number }> = {
  quick: { token: "--duration-quick", fallback: 180 },
  sheet: { token: "--duration-sheet", fallback: 320 },
};

function seconds(name: DurationName): number {
  const { token, fallback } = DURATION_TOKEN[name];
  return tokenMs(token, fallback) / 1000;
}

/** The exit of a node: opacity, and (for a collapse) its height, gone. */
function ExitItem({
  as = "div",
  style,
  exitTo,
  enterFrom,
  duration,
  ease,
  ...rest
}: ExitElementProps & {
  exitTo: Record<string, number>;
  enterFrom?: Record<string, number>;
  duration: DurationName;
  ease: readonly [number, number, number, number];
}) {
  const present = useIsPresent();
  const reduced = prefersReducedMotion();
  const Tag = TAGS[as] as typeof m.div;
  const transition = {
    duration: reduced ? 0 : seconds(duration),
    ease: [ease[0], ease[1], ease[2], ease[3]] as [number, number, number, number],
  };
  return (
    <Tag
      {...rest}
      aria-hidden={present ? rest["aria-hidden"] : true}
      inert={present ? undefined : true}
      data-exiting={present ? undefined : ""}
      initial={enterFrom && !reduced ? enterFrom : undefined}
      animate={enterFrom ? { opacity: 1, scale: 1 } : undefined}
      exit={reduced ? undefined : { ...exitTo, transition }}
      transition={transition}
      style={present ? style : { ...style, overflow: "hidden", pointerEvents: "none" }}
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
