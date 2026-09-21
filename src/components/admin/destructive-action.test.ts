import { describe, expect, test } from "bun:test";
import {
  canConfirm,
  destructiveActionReducer,
  IDLE_DESTRUCTIVE_ACTION,
  isArmed,
  isBusy,
  isRunning,
  reasonFor,
  type DestructiveActionEvent,
  type DestructiveActionState,
} from "./destructive-action";

/**
 * The launch review found single-click destruction in the Admin console, and
 * one defect underneath it: the motive gating every destructive button was
 * page-level state. Write eight characters about one role and every *other*
 * row's "Révoquer le rôle" went live with it.
 *
 * These tests are the regression lock. They are deliberately written against
 * the state machine rather than against rendered markup -- this repository has
 * no DOM test setup, and a rule that only holds inside a component is a rule
 * nobody can check.
 */

/** Mirrors the server's own motive floor. */
const MIN = 8;

/** Two rows of the same kind: the pair the original defect crossed. */
const ROW_A = "revoke-assignment:1f0b0d9e-0000-4000-8000-00000000000a";
const ROW_B = "revoke-assignment:1f0b0d9e-0000-4000-8000-00000000000b";
/** A different operation on the *same* object as ROW_A. */
const OTHER_OP_SAME_ROW = "approve:1f0b0d9e-0000-4000-8000-00000000000a";

const MOTIVE = "offboarding ticket SEC-4120";

function run(
  events: readonly DestructiveActionEvent[],
  from: DestructiveActionState = IDLE_DESTRUCTIVE_ACTION,
): DestructiveActionState {
  return events.reduce(destructiveActionReducer, from);
}

/** Arm `key` and type a motive long enough to satisfy the server's floor. */
function armedWithMotive(key: string, motive = MOTIVE): DestructiveActionState {
  return run([
    { type: "arm", key },
    { type: "reason", key, value: motive },
  ]);
}

describe("destructive action arming", () => {
  test("nothing is armed, running or confirmable from a cold start", () => {
    expect(IDLE_DESTRUCTIVE_ACTION).toEqual({ armed: null, reason: "", running: null });
    expect(isArmed(IDLE_DESTRUCTIVE_ACTION, ROW_A)).toBe(false);
    expect(isBusy(IDLE_DESTRUCTIVE_ACTION)).toBe(false);
    expect(canConfirm(IDLE_DESTRUCTIVE_ACTION, ROW_A, MIN)).toBe(false);
  });

  // Requirement 5. The trigger press is not the destructive press.
  test("pressing a trigger arms the row but cannot execute it", () => {
    const state = run([{ type: "arm", key: ROW_A }]);
    expect(isArmed(state, ROW_A)).toBe(true);
    expect(reasonFor(state, ROW_A)).toBe("");
    expect(canConfirm(state, ROW_A, MIN)).toBe(false);
  });

  test("only one action is armed at a time", () => {
    const state = run([
      { type: "arm", key: ROW_A },
      { type: "arm", key: ROW_B },
    ]);
    expect(isArmed(state, ROW_A)).toBe(false);
    expect(isArmed(state, ROW_B)).toBe(true);
  });

  test("re-arming the row already armed keeps the motive being typed", () => {
    // A double tap on a trigger must not silently wipe half-typed input.
    const state = run([{ type: "arm", key: ROW_A }], armedWithMotive(ROW_A));
    expect(reasonFor(state, ROW_A)).toBe(MOTIVE);
    expect(canConfirm(state, ROW_A, MIN)).toBe(true);
  });
});

describe("a motive belongs to one action and to nothing else", () => {
  // REQUIREMENT 3 -- the regression this whole change exists for.
  test("a motive typed for one row never arms another row", () => {
    const state = armedWithMotive(ROW_A);

    expect(canConfirm(state, ROW_A, MIN)).toBe(true);
    expect(canConfirm(state, ROW_B, MIN)).toBe(false);
    expect(reasonFor(state, ROW_B)).toBe("");
    expect(isArmed(state, ROW_B)).toBe(false);
  });

  test("a motive typed for one action never arms another action on the same object", () => {
    // Same approval request, different decision: still a different action.
    const state = armedWithMotive(ROW_A);
    expect(canConfirm(state, OTHER_OP_SAME_ROW, MIN)).toBe(false);
    expect(reasonFor(state, OTHER_OP_SAME_ROW)).toBe("");
  });

  test("arming a second row drops the motive written about the first", () => {
    const state = run([{ type: "arm", key: ROW_B }], armedWithMotive(ROW_A));

    expect(state.reason).toBe("");
    expect(reasonFor(state, ROW_A)).toBe("");
    expect(reasonFor(state, ROW_B)).toBe("");
    expect(canConfirm(state, ROW_A, MIN)).toBe(false);
    expect(canConfirm(state, ROW_B, MIN)).toBe(false);
  });

  test("a motive addressed to a row that is not armed is discarded", () => {
    // A stale field from a row that has since lost its confirm step cannot
    // write into the armed row's motive, in either direction.
    const state = run([
      { type: "arm", key: ROW_A },
      { type: "reason", key: ROW_B, value: MOTIVE },
    ]);

    expect(reasonFor(state, ROW_A)).toBe("");
    expect(reasonFor(state, ROW_B)).toBe("");
    expect(canConfirm(state, ROW_A, MIN)).toBe(false);
    expect(canConfirm(state, ROW_B, MIN)).toBe(false);
  });

  test("no sequence of events leaves two actions confirmable at once", () => {
    const keys = [ROW_A, ROW_B, OTHER_OP_SAME_ROW];
    const scripts: DestructiveActionEvent[][] = keys.flatMap((first) =>
      keys.map((second) => [
        { type: "arm", key: first },
        { type: "reason", key: first, value: MOTIVE },
        { type: "arm", key: second },
        { type: "reason", key: second, value: MOTIVE },
      ]),
    );

    for (const script of scripts) {
      const state = run(script);
      const confirmable = keys.filter((key) => canConfirm(state, key, MIN));
      expect(confirmable.length).toBeLessThanOrEqual(1);
    }
  });
});

describe("the motive must clear the server's floor", () => {
  test("a motive shorter than the floor cannot be confirmed", () => {
    expect(canConfirm(armedWithMotive(ROW_A, "1234567"), ROW_A, MIN)).toBe(false);
    expect(canConfirm(armedWithMotive(ROW_A, "12345678"), ROW_A, MIN)).toBe(true);
  });

  test("whitespace does not count towards the floor", () => {
    expect(canConfirm(armedWithMotive(ROW_A, "   ab   "), ROW_A, MIN)).toBe(false);
  });

  test("an Arabic motive is measured the same way", () => {
    expect(canConfirm(armedWithMotive(ROW_A, "مغادرة"), ROW_A, MIN)).toBe(false);
    expect(canConfirm(armedWithMotive(ROW_A, "مغادرة الفريق"), ROW_A, MIN)).toBe(true);
  });
});

describe("resetting after the action ends", () => {
  // Requirement 4 -- cancel.
  test("cancel clears the armed action and its motive", () => {
    const state = run([{ type: "cancel" }], armedWithMotive(ROW_A));
    expect(state).toEqual(IDLE_DESTRUCTIVE_ACTION);
    expect(canConfirm(state, ROW_A, MIN)).toBe(false);
  });

  test("re-arming after a cancel starts from an empty motive", () => {
    const state = run([{ type: "cancel" }, { type: "arm", key: ROW_A }], armedWithMotive(ROW_A));
    expect(reasonFor(state, ROW_A)).toBe("");
    expect(canConfirm(state, ROW_A, MIN)).toBe(false);
  });

  // Requirement 4 -- completion.
  test("a completed operation resets exactly like a cancel", () => {
    const state = run([{ type: "start" }, { type: "settle" }], armedWithMotive(ROW_A));
    expect(state).toEqual(IDLE_DESTRUCTIVE_ACTION);
    expect(isBusy(state)).toBe(false);
    expect(canConfirm(state, ROW_A, MIN)).toBe(false);
  });

  test("a refused operation leaves nothing armed behind either", () => {
    // `settle` is the single terminal event: the route dispatches it from a
    // `finally`, so a rejection cannot leave a loaded confirm step on screen.
    const state = run([{ type: "start" }, { type: "settle" }], armedWithMotive(ROW_B));
    expect(state).toEqual(IDLE_DESTRUCTIVE_ACTION);
  });
});

describe("while an operation is in flight", () => {
  const inFlight = run([{ type: "start" }], armedWithMotive(ROW_A));

  test("the running action is the one that was armed, and only it", () => {
    expect(isRunning(inFlight, ROW_A)).toBe(true);
    expect(isRunning(inFlight, ROW_B)).toBe(false);
    expect(isBusy(inFlight)).toBe(true);
  });

  test("nothing else can be armed on top of it", () => {
    expect(run([{ type: "arm", key: ROW_B }], inFlight)).toEqual(inFlight);
  });

  test("its motive can no longer be edited", () => {
    expect(run([{ type: "reason", key: ROW_A, value: "rewritten" }], inFlight)).toEqual(inFlight);
  });

  test("it cannot be confirmed a second time", () => {
    expect(canConfirm(inFlight, ROW_A, MIN)).toBe(false);
    expect(run([{ type: "start" }], inFlight)).toEqual(inFlight);
  });

  test("cancel does not pretend to call back a request already sent", () => {
    expect(run([{ type: "cancel" }], inFlight)).toEqual(inFlight);
  });
});

describe("start is inert unless something is armed", () => {
  test("nothing armed means nothing runs", () => {
    expect(run([{ type: "start" }])).toEqual(IDLE_DESTRUCTIVE_ACTION);
    expect(isBusy(run([{ type: "start" }]))).toBe(false);
  });
});
