import { useSyncExternalStore } from "react";

/**
 * Whether the launch sequence (`LaunchGate` in `src/routes/__root.tsx`: the
 * splash, then the first-launch language chooser) has let go of the screen.
 *
 * A page that wants to open a dialog of its own on arrival -- the prize
 * welcome -- waits for this, so it never opens underneath the splash or on top
 * of the language chooser, and never fights either for focus. The chooser is
 * already observable through `useI18n().hasChosen`; the splash lived only in
 * LaunchGate's local state, so LaunchGate reports it here.
 */
let splashDone = false;
const listeners = new Set<() => void>();

export function markSplashDone(): void {
  if (splashDone) return;
  splashDone = true;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** `false` on the server and until LaunchGate reports the splash finished. */
export function useSplashDone(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => splashDone,
    () => false,
  );
}
