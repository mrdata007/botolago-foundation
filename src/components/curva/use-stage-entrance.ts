import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";

import { entranceShownThisSession, markEntranceShown } from "@/components/manager-card/storage";
import { useI18n } from "@/i18n/provider";
import { prefersReducedMotion, tokenMs } from "@/lib/motion";

import { entranceDecision, entranceFrames, entranceMs, groundFrames } from "./entrance";
import { whenQuiet } from "./quiet";
import { useLaunchGate } from "./use-launch-gate";

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** A motion token's easing curve as written in `styles.css`, for the Web Animations API (no `var()`). */
function tokenEasing(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return raw.startsWith("cubic-bezier(") ? raw : fallback;
}

export interface StageEntrance {
  /** The wrapper that rises and settles (outside the card's tilt tree). */
  liftRef: RefObject<HTMLDivElement | null>;
  /** The shadow on the ground that grows under it. */
  groundRef: RefObject<HTMLSpanElement | null>;
  /** The entrance is playing: the card's tilt and float stay off until it has landed. */
  entering: boolean;
}

/**
 * The stage's entrance, decided once, when the stage mounts (`entranceDecision`): in a layout
 * effect, so the first painted frame is already the animation's first frame and nothing flashes.
 * It runs on the Web Animations API, on the two wrappers `CardStage` draws for it, never on the
 * card's tilt tree. `entering` holds the tilt and the touch float off until it ends, so the two
 * never move the card at once; the float starts when the entrance has landed.
 *
 * `heroDue` is asked at that moment, not at render: whether a hero is, or is about to be, the
 * visit's moment, which would carry the card and hide this stage's copy.
 */
export function useStageEntrance(input: {
  enabled: boolean;
  heroDue: () => boolean;
}): StageEntrance {
  const { isHydrated } = useI18n();
  const gateOpen = useLaunchGate();
  const liftRef = useRef<HTMLDivElement | null>(null);
  const groundRef = useRef<HTMLSpanElement | null>(null);
  const [entering, setEntering] = useState(false);
  // What the mount saw: a stage that rendered before hydration finished was in the server's HTML.
  const first = useRef({ presentAtFirstPaint: !isHydrated, gateOpen });
  const heroDue = useRef(input.heroDue);
  heroDue.current = input.heroDue;
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useIsomorphicLayoutEffect(() => {
    const decision = entranceDecision({
      enabled: input.enabled,
      reducedMotion: prefersReducedMotion(),
      playedThisSession: entranceShownThisSession(),
      presentAtFirstPaint: first.current.presentAtFirstPaint,
      heroDue: input.enabled ? heroDue.current() : false,
      launchGateOpen: first.current.gateOpen,
    });
    if (decision.remember) markEntranceShown();
    const lift = liftRef.current;
    if (!decision.play || !lift || typeof lift.animate !== "function") return;
    // Hidden at its rest box (opacity 0 inline, so nothing flashes and the box does not move) until
    // the page is quiet, then played: started at the stage's mount it competed with the rest of the
    // screen's first render and the card's first raster, and played as three frames after an empty
    // wait (`quiet.ts`). The animation's own first frame is opacity 0, so handing over is seamless.
    lift.style.opacity = "0";
    setEntering(true);
    const done = () => {
      if (mounted.current) setEntering(false);
    };
    void whenQuiet().done.then(() => {
      if (!mounted.current || !lift.isConnected) return;
      try {
        const duration = entranceMs(tokenMs("--duration-hero", 420));
        const easing = tokenEasing("--ease-emphasized", "cubic-bezier(0.2, 0.9, 0.1, 1)");
        const dir = document.documentElement.dir === "rtl" ? -1 : 1;
        const animations = [lift.animate(entranceFrames(dir), { duration, easing })];
        const ground = groundRef.current;
        if (ground) animations.push(ground.animate(groundFrames(), { duration, easing }));
        Promise.all(animations.map((animation) => animation.finished)).then(done, done);
      } catch {
        // Whatever failed, the card is shown at rest and its tilt comes back.
        done();
      } finally {
        // The hold ends here on every path: the stage is never left invisible.
        lift.style.removeProperty("opacity");
      }
    });
    // The entrance is a one-off of the mount: nothing here is re-run.
  }, []);

  return { liftRef, groundRef, entering };
}
