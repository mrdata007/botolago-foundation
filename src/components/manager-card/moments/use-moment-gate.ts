import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { toast } from "sonner";

import { STEP_UP_TOAST_ID } from "@/auth/step-up-notice";
import type { MyCardDto } from "@/backend/manager-card/contracts";
import { useI18n } from "@/i18n/provider";
import { useSplashDone } from "@/lib/launch-sequence";
import { fantasyService } from "@/services/fantasy-runtime";
import { useAckMoments } from "@/services/use-manager-card";

import { heroShownThisSession, markHeroShown } from "../storage";
import type { HeroSpec, LineSpec } from "../types";
import { createMomentStore, linesOf, type GateSnapshot, type GateSurface } from "./moment-store";

/**
 * What the moment gate hands a surface (plan sections 5.3 and 7.6): the one hero this session may
 * show, the one-line states, and the acknowledgement.
 *
 * The rules live in `pickHero` (pure, tested); the memory of what was decided lives in the
 * moment store; this hook only feeds them the facts a component can see:
 *
 *  - the launch gate: `useSplashDone() && isHydrated && hasChosen`, the PrizeWelcome gate. Until
 *    it is open the hook returns nothing at all, on the server and in the first client render, so
 *    markup and hydration agree;
 *  - the next Fantasy deadline, read from the gameweek query the Fantasy screens already share
 *    (`["gameweek"]`); the decision waits until that read settles, so a hero never opens in the
 *    last hour before a deadline for want of knowing it;
 *  - whether something that must be left alone is open: a mounted `useMomentBlock(true)` (the
 *    import prompt) or the step-up notice.
 *
 * Every component that asks for the same surface reads the same decision, so the page, the hero,
 * the born panel and the lines never disagree. `ack` is optimistic (device cache first, one call
 * for however many keys), and stills the hero's beat at once.
 */
export const momentStore = createMomentStore({
  heroShown: heroShownThisSession,
  markHeroShown,
});

const NOTHING: GateSnapshot = { hero: null, acked: false, momentLines: [] };

function stepUpNoticeOpen(): boolean {
  try {
    return toast.getToasts().some((entry) => entry.id === STEP_UP_TOAST_ID);
  } catch {
    return false;
  }
}

/**
 * While `active`, no hero or born panel opens: the import prompt calls this with its open state.
 * Heroes decided before it opened are not taken back.
 */
export function useMomentBlock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    momentStore.block(true);
    return () => momentStore.block(false);
  }, [active]);
}

export interface MomentGate {
  hero: HeroSpec | null;
  lines: LineSpec[];
  ack(keys: readonly string[]): void;
  /** The hero's keys were acknowledged: its label, line and buttons collapse, the card stays. */
  acked: boolean;
  /** The launch gate is open: a surface may count a view. */
  ready: boolean;
}

export function useMomentGate(surface: GateSurface, card: MyCardDto | null): MomentGate {
  const { isHydrated, hasChosen } = useI18n();
  const splashDone = useSplashDone();
  const ready = splashDone && isHydrated && hasChosen;
  const acknowledge = useAckMoments();

  const snapshot = useSyncExternalStore(
    momentStore.subscribe,
    () => momentStore.get(surface),
    () => NOTHING,
  );
  const blocked = useSyncExternalStore(
    momentStore.subscribe,
    () => momentStore.blockers > 0,
    () => false,
  );

  const gameweek = useQuery({
    queryKey: ["gameweek"],
    queryFn: () => fantasyService.getCurrentGameweek(),
    enabled: ready && card !== null,
    staleTime: 60_000,
    retry: false,
  });
  const deadlineKnown = gameweek.isSuccess || gameweek.isError;
  const deadline = gameweek.data?.deadline ?? null;

  useEffect(() => {
    if (!ready || !card || !deadlineKnown) return;
    const at = deadline ? Date.parse(deadline) : Number.NaN;
    momentStore.evaluate(surface, {
      card,
      minutesToDeadline: Number.isFinite(at) ? (at - Date.now()) / 60_000 : null,
      launchGateOpen: true,
      blocked: blocked || stepUpNoticeOpen(),
    });
  }, [surface, ready, card, deadlineKnown, deadline, blocked]);

  const ack = useCallback(
    (keys: readonly string[]) => {
      if (keys.length === 0) return;
      momentStore.markAcked(keys);
      void acknowledge(keys);
    },
    [acknowledge],
  );

  const lines = useMemo(
    () => (ready ? linesOf(card, snapshot.momentLines) : []),
    [ready, card, snapshot.momentLines],
  );
  return { hero: ready ? snapshot.hero : null, lines, ack, acked: snapshot.acked, ready };
}

/* ------------------------------------------------------------------------------------------ */
/* Acknowledged by being seen                                                                   */
/* ------------------------------------------------------------------------------------------ */

/** Two seconds at least half on screen: one full look (plan 5.3). */
export const SEEN_RATIO = 0.5;
export const SEEN_MS = 2000;

/**
 * Calls `onSeen` once when the element has been at least `SEEN_RATIO` on screen for `SEEN_MS` in a
 * visible tab. Without `IntersectionObserver` it does nothing: the ×, the buttons and the next
 * visit still acknowledge. Leaving the screen, or hiding the tab, restarts the count.
 */
export function useSeenFor(
  ref: { current: Element | null },
  enabled: boolean,
  onSeen: () => void,
  ms: number = SEEN_MS,
): void {
  const done = useRef(false);
  const latest = useRef(onSeen);
  latest.current = onSeen;
  useEffect(() => {
    const element = ref.current;
    if (!enabled || done.current || !element || typeof IntersectionObserver === "undefined") return;
    let timer: number | null = null;
    let inView = false;
    const stop = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = null;
    };
    const check = () => {
      stop();
      if (!inView || document.visibilityState !== "visible" || done.current) return;
      timer = window.setTimeout(() => {
        done.current = true;
        latest.current();
      }, ms);
    };
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries.at(-1);
        inView = !!entry && entry.isIntersecting && entry.intersectionRatio >= SEEN_RATIO;
        check();
      },
      { threshold: [0, SEEN_RATIO, 1] },
    );
    observer.observe(element);
    document.addEventListener("visibilitychange", check);
    return () => {
      stop();
      observer.disconnect();
      document.removeEventListener("visibilitychange", check);
    };
  }, [ref, enabled, ms]);
}
