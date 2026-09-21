/**
 * The arming model behind every destructive Admin action.
 *
 * THE DEFECT THIS EXISTS TO MAKE IMPOSSIBLE
 *
 * The staff dossier and the approvals queue each used to hold one page-level
 * `reason` string, and every destructive button on the page was enabled the
 * moment that one string reached eight characters. So after revoking a single
 * role, every *other* row's "Révoquer le rôle" was already armed, with a motive
 * that had been written about a different object. One stray tap revoked the
 * wrong role -- immediately, irreversibly, and with an audit trail whose motive
 * described something else entirely.
 *
 * The fix is structural rather than advisory. There is exactly one `armed` key
 * and exactly one `reason`, and the reason is *stored next to the key it was
 * typed for*. There is no second slot a reason could be read out of, so a
 * motive written for row A cannot arm row B: `reasonFor(state, b)` returns ""
 * by construction, and `canConfirm(state, b, ...)` is therefore false. Arming a
 * different action does not carry the old motive across -- it drops it.
 *
 * WHY A REDUCER, AND WHY IT LIVES IN A `.ts` FILE
 *
 * The repository has no DOM test setup, so a state machine buried inside a
 * component is untestable in practice. Keeping the transitions here -- pure, no
 * React import, no JSX -- means the regression above is locked by a normal unit
 * test (see `destructive-action.test.ts`) rather than by a comment asking
 * future maintainers to be careful. `route-access.ts` and its test are the
 * model this follows.
 *
 * WHAT IT DELIBERATELY IS NOT
 *
 * Not an approval ceremony. One action is armed at a time; confirming takes a
 * motive and a second, explicit press; abandoning is always one press away.
 * Server-side authorization is untouched: the server re-validates the motive
 * and every permission on every call, exactly as before.
 */

/**
 * Which action, if any, is currently armed -- and the motive typed for *that*
 * action. `armed` and `reason` move together: nothing can read a motive back
 * out except through the key it was written under.
 */
export interface DestructiveActionState {
  /** The armed action's key, or `null` when nothing is armed. */
  readonly armed: string | null;
  /** The motive typed for `armed`. Meaningless -- and unreadable -- otherwise. */
  readonly reason: string;
  /** The key of the action currently executing, or `null`. */
  readonly running: string | null;
}

/** Nothing armed, nothing typed, nothing in flight. */
export const IDLE_DESTRUCTIVE_ACTION: DestructiveActionState = {
  armed: null,
  reason: "",
  running: null,
};

export type DestructiveActionEvent =
  /** A trigger was pressed: enter the confirm step for `key`. */
  | { readonly type: "arm"; readonly key: string }
  /**
   * The motive field changed. `key` is carried so a field belonging to a row
   * that is no longer armed cannot write into the armed row's motive.
   */
  | { readonly type: "reason"; readonly key: string; readonly value: string }
  /** The operator backed out of the confirm step. */
  | { readonly type: "cancel" }
  /** The confirmed mutation was dispatched. */
  | { readonly type: "start" }
  /** The mutation finished -- succeeded or failed, it makes no difference here. */
  | { readonly type: "settle" };

export function destructiveActionReducer(
  state: DestructiveActionState,
  event: DestructiveActionEvent,
): DestructiveActionState {
  switch (event.type) {
    case "arm": {
      // Nothing may be armed on top of a mutation already in flight.
      if (state.running !== null) return state;
      // Re-arming what is already armed is idempotent, so a double press on a
      // trigger cannot silently wipe a motive the operator has begun typing.
      if (state.armed === event.key) return state;
      // Arming anything else starts from an empty motive. This single line is
      // requirement 3: a reason written for one object never reaches another.
      return { armed: event.key, reason: "", running: null };
    }
    case "reason": {
      if (state.running !== null) return state;
      if (state.armed !== event.key) return state;
      return { ...state, reason: event.value };
    }
    case "cancel": {
      // A mutation in flight cannot be called back from the browser; pretending
      // otherwise would leave the UI claiming an outcome the server never gave.
      if (state.running !== null) return state;
      return IDLE_DESTRUCTIVE_ACTION;
    }
    case "start": {
      if (state.armed === null || state.running !== null) return state;
      return { ...state, running: state.armed };
    }
    case "settle": {
      // Reset on failure too. A refused destructive action must not leave a
      // loaded confirm step behind for the next passing tap; the operator
      // reads the refusal and arms it again deliberately.
      return IDLE_DESTRUCTIVE_ACTION;
    }
  }
}

/** Is `key` the action currently showing its confirm step? */
export function isArmed(state: DestructiveActionState, key: string): boolean {
  return state.armed === key;
}

/** Is `key` the action currently executing? */
export function isRunning(state: DestructiveActionState, key: string): boolean {
  return state.running === key;
}

/** Is *any* action on this surface executing? Triggers stay disabled while so. */
export function isBusy(state: DestructiveActionState): boolean {
  return state.running !== null;
}

/**
 * The motive typed for `key` -- and "" for every other action on the surface.
 * This is the read side of the invariant: there is no way to obtain a motive
 * that was written under a different key.
 */
export function reasonFor(state: DestructiveActionState, key: string): string {
  return state.armed === key ? state.reason : "";
}

/**
 * May `key` be confirmed right now? Requires that `key` itself is armed, that
 * nothing is in flight, and that the motive typed *for this key* is long
 * enough. `minimumReasonLength` mirrors the server's own floor so the operator
 * can see why the button is still dead; the server re-validates regardless.
 */
export function canConfirm(
  state: DestructiveActionState,
  key: string,
  minimumReasonLength: number,
): boolean {
  if (state.armed !== key) return false;
  if (state.running !== null) return false;
  return state.reason.trim().length >= minimumReasonLength;
}
