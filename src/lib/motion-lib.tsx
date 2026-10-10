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
 * The part of the exit wrapper that imports Motion. `motion-exit.tsx` loads
 * this file with a dynamic import, so the library stays out of the shared
 * first-load chunk (docs/engineering/MOTION_PLAN_4.md). Only that file and this
 * one import `motion/react`; screens import `motion-exit.tsx`.
 */

export type ExitMode = "sync" | "popLayout" | "wait";
export type ExitTag = "div" | "li" | "ul";
export type DurationName = "quick" | "sheet";
export type Bezier = readonly [number, number, number, number];

const TAGS = { div: m.div, li: m.li, ul: m.ul } as const;

const DURATION_TOKEN: Record<DurationName, { token: string; fallback: number }> = {
  quick: { token: "--duration-quick", fallback: 180 },
  sheet: { token: "--duration-sheet", fallback: 320 },
};

function seconds(name: DurationName): number {
  const { token, fallback } = DURATION_TOKEN[name];
  return tokenMs(token, fallback) / 1000;
}

/** `LazyMotion` (strict, `domMin`: animation and exit, no gestures) + presence. */
export function Presence({ children, mode }: { children?: ReactNode; mode: ExitMode }) {
  return (
    <LazyMotion features={domMin} strict>
      <MotionConfig reducedMotion="user">
        <AnimatePresence initial={false} mode={mode}>
          {children}
        </AnimatePresence>
      </MotionConfig>
    </LazyMotion>
  );
}

/** The exit of a node: opacity, and (for a collapse) its height, gone. */
export function Item({
  as = "div",
  style,
  exitTo,
  enterFrom,
  duration,
  ease,
  ...rest
}: Omit<HTMLMotionProps<"div">, "initial" | "animate" | "exit" | "transition"> & {
  as?: ExitTag;
  exitTo: Record<string, number>;
  enterFrom?: Record<string, number>;
  duration: DurationName;
  ease: Bezier;
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
