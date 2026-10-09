import { useEffect, useRef } from "react";

import { track, type AnalyticsEvent } from "@/lib/analytics";

import { useLaunchGate } from "./use-launch-gate";

/**
 * Counts one view, once per mount, after the launch gate opens (plan 5.3: no view is counted before
 * the splash and the language chooser have let go, and a server render counts nothing). `event`
 * null counts nothing yet, so a screen that does not know what it is (loading) waits.
 */
export function useViewEvent(event: AnalyticsEvent | null): void {
  const open = useLaunchGate();
  const sent = useRef<AnalyticsEvent | null>(null);
  useEffect(() => {
    if (!open || event === null || sent.current === event) return;
    sent.current = event;
    track(event);
  }, [open, event]);
}
