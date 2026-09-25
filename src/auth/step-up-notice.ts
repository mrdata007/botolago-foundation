// What the reader is told when the server refuses a read or a write for want
// of the one-time code (`PT403 mfa_required`, see `@/backend/auth/step-up`),
// and the listener `SecondFactorGate` hangs on those refusals. Kept apart from
// the component so the listener's rules run as plain functions in the tests.

import { toast } from "sonner";
import type { TranslationKey } from "@/i18n/dictionaries";
import type { AuthSession, AuthStatus } from "@/services/auth-types";

/**
 * One toast per refusal, however many say so. A single refused save is mapped
 * by more than one layer, each reports it, and a screen may add the same
 * sentence itself: under one id sonner shows it once.
 */
export const STEP_UP_TOAST_ID = "auth-step-up";

/** "Confirm your sign-in with the code", once. */
export function showStepUpNotice(t: (key: TranslationKey) => string): void {
  toast.message(t("auth.step_up.toast"), { id: STEP_UP_TOAST_ID });
}

export interface StepUpResponderDeps {
  /** Say why the action failed (`showStepUpNotice`). */
  readonly notify: () => void;
  /** The session as the app currently holds it. */
  readonly getStatus: () => AuthStatus;
  /** Re-read the session with a fresh token and publish it. */
  readonly recheck: () => Promise<AuthSession>;
}

/**
 * The listener for step-up refusals.
 *
 * It always says so. It used to speak only once a fresh session confirmed the
 * code was owed, so a refusal that arrived while a recheck was running, or
 * after a refresh that failed (the stale token still reads "complete"), was
 * met with silence -- and a screen that had left the message to it (the follow
 * button) failed without a word.
 *
 * It then asks again, one recheck at a time and only for a session the app
 * still counts as complete: when the fresh session owes the code, it is
 * published as `mfa_required` and the gate takes the reader to the challenge.
 * A session that already owes it is on its way there.
 */
export function createStepUpResponder({
  notify,
  getStatus,
  recheck,
}: StepUpResponderDeps): () => void {
  let checking = false;
  return () => {
    notify();
    if (checking || getStatus() !== "authenticated") return;
    checking = true;
    void (async () => {
      try {
        await recheck();
      } catch {
        // Unchanged session: the message above has been given.
      } finally {
        checking = false;
      }
    })();
  };
}
