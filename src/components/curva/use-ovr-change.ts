import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import type { MyCardDto } from "@/backend/manager-card/contracts";
import { prefersReducedMotion } from "@/lib/motion";
import { useAckMoments } from "@/services/use-manager-card";

import {
  COUNT_DELAY_MS,
  COUNT_EASE,
  GLOW_HOLD_MS,
  countMs,
  countValue,
  pendingOvrChange,
  type OvrChange,
} from "./ovr-change";
import { useLaunchGate } from "./use-launch-gate";
import type { RatingBadge } from "./use-rating-change";

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** What the rating line and the stage draw while (and after) a rating change plays. */
export interface OvrChangeBeat {
  /** The number to show: the old one before and during the count, then the card's own. */
  shownOvr: number | null;
  /** The halo behind the card while the number counts. */
  glow: "up" | "down" | null;
  /** The chip of the change (its own delta), or null when there is no change to tell. */
  badge: RatingBadge | null;
}

type Phase = "idle" | "ready" | "counting" | "landed" | "done";

/**
 * Plays a rating change once (brief `MANAGER_CARD_OVR_CHANGE_BRIEF.md`): when the card read serves
 * one (`card.ovrChanges`) and the launch gate has opened, the number shows the old value, counts to
 * the new one with Motion after the card's entrance, the halo glows meanwhile, and the chip pops;
 * then the change is acknowledged (optimistic, server-kept), so it never plays again, on this phone
 * or another. Under reduced motion: the new number and the chip at once, no count, no glow, no pop,
 * and the change is acknowledged all the same.
 *
 * `acknowledge` is the acknowledgement call (`useAckMoments` by default); the development sample
 * passes its own. Without a change the beat is inert and the caller keeps its own chip.
 */
export function useOvrChangeBeat(input: {
  card: MyCardDto;
  ovr: number | null;
  /** Wait (a moment's hero carries the card): the change plays once it is let go. */
  hold?: boolean;
  acknowledge?: (keys: readonly string[]) => Promise<void>;
}): OvrChangeBeat {
  const { card, ovr, hold = false } = input;
  const ack = useAckMoments();
  const acknowledge = input.acknowledge ?? ack;
  const found = useMemo(() => pendingOvrChange(card, ovr), [card, ovr]);
  // Latched on first sight: the acknowledgement removes the change from the cached card, and the
  // beat must finish on what it started with.
  const [change, setChange] = useState<OvrChange | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [shown, setShown] = useState<number | null>(null);
  const [still, setStill] = useState(false);
  const acked = useRef<string | null>(null);
  const open = useLaunchGate();

  const send = (key: string) => {
    if (acked.current === key) return;
    acked.current = key;
    void acknowledge([key]).catch(() => undefined);
  };

  // Before the first painted frame, so the new number never flashes first: the old number shows
  // from the start (behind the splash too), and counts once the launch gate has opened.
  useIsomorphicLayoutEffect(() => {
    if (hold || !found || change) return;
    setChange(found);
    if (prefersReducedMotion()) {
      setStill(true);
      setShown(found.to);
      setPhase("done");
      send(found.key);
      return;
    }
    setShown(found.from);
    setPhase("ready");
  }, [hold, found]);

  // Once the launch gate has opened, the card's entrance lands first.
  useEffect(() => {
    if (phase !== "ready" || !open) return;
    const timer = window.setTimeout(() => setPhase("counting"), COUNT_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [phase, open]);

  // The count, with Motion (loaded on demand, so it stays out of the first-load chunk). Without
  // it (a failed chunk) the number lands at once.
  useEffect(() => {
    if (phase !== "counting" || !change) return;
    let cancelled = false;
    let stop: (() => void) | null = null;
    const land = () => {
      if (cancelled) return;
      setShown(change.to);
      setPhase("landed");
    };
    import("motion")
      .then(({ animate }) => {
        if (cancelled) return;
        const controls = animate(change.from, change.to, {
          duration: countMs(change.delta) / 1000,
          ease: COUNT_EASE,
          onUpdate: (value) => {
            if (!cancelled) setShown(countValue(change.from, change.to, value));
          },
        });
        stop = () => controls.stop();
        void controls.then(land, land);
      })
      .catch(land);
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [phase, change]);

  useEffect(() => {
    if (phase !== "landed" || !change) return;
    const timer = window.setTimeout(() => {
      setPhase("done");
      send(change.key);
    }, GLOW_HOLD_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, change]);

  // Leaving mid-way: the change was seen, it is acknowledged.
  const latest = useRef({ change, phase, send });
  latest.current = { change, phase, send };
  useEffect(
    () => () => {
      const { change: playing, phase: at, send: ackNow } = latest.current;
      if (playing && (at === "counting" || at === "landed")) ackNow(playing.key);
    },
    [],
  );

  if (!change) return { shownOvr: ovr, glow: null, badge: null };
  const counting = phase === "counting" || phase === "landed";
  return {
    shownOvr: phase === "done" ? ovr : (shown ?? ovr),
    glow: counting ? (change.delta > 0 ? "up" : "down") : null,
    badge: phase === "ready" ? null : { delta: change.delta, pop: !still && phase !== "done" },
  };
}
