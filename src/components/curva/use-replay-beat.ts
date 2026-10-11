import { useCallback, useEffect, useRef, useState } from "react";

import type { BeatName } from "@/components/manager-card/types";

/**
 * Whether a « Revoir » that plays a beat can exist: motion is allowed. False on the server and in
 * the first client render (so they agree), then the reader's setting; under reduced motion the
 * beat buttons are not drawn at all (plan 5.4: no « Revoir » beat button).
 */
export function useMotionAllowed(): boolean {
  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setAllowed(!query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return allowed;
}

/** The longest beat is 700 ms; the prop is dropped after this, so the next tap re-arms it. */
const HOLD_MS = 900;

/**
 * A beat played on a tap. `play` sets the beat (dropping any current one first, so a second tap
 * replays it); it is dropped by itself once it has had time to finish, which is what lets the
 * card re-arm (`ManagerCard` replays only after the prop has been dropped).
 */
export function useBeatPlayback(): { beat: BeatName | undefined; play: (beat: BeatName) => void } {
  const [beat, setBeat] = useState<BeatName | undefined>(undefined);
  const timers = useRef<number[]>([]);
  // Whether a beat is set right now (state lags a render behind a tap).
  const set = useRef(false);
  useEffect(
    () => () => {
      for (const id of timers.current) window.clearTimeout(id);
    },
    [],
  );
  const play = useCallback((next: BeatName) => {
    for (const id of timers.current) window.clearTimeout(id);
    // A beat that is still set is dropped first and the new one set a moment later, so the card
    // re-arms and plays it again. With none set there is nothing to drop: the beat starts with the
    // tap, not 30 ms after it.
    const rearm = set.current;
    if (rearm) setBeat(undefined);
    const start = () => {
      set.current = true;
      setBeat(next);
    };
    if (rearm) timers.current = [window.setTimeout(start, 30)];
    else {
      start();
      timers.current = [];
    }
    timers.current.push(
      window.setTimeout(() => {
        set.current = false;
        setBeat(undefined);
      }, 30 + HOLD_MS),
    );
  }, []);
  return { beat, play };
}
