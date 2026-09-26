import { describe, expect, it } from "bun:test";

import type { AuthSession, AuthStatus } from "@/services/auth-types";
import { createStepUpResponder } from "./step-up-notice";

// The listener SecondFactorGate hangs on `PT403 mfa_required` refusals. The
// first version spoke only once a fresh session confirmed the code was owed,
// so a refusal met while a recheck was running, for a session the app no
// longer counted as complete, or after a failed refresh, got no word at all --
// and the follow button, which leaves the message to it, failed in silence.

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  let reject: (reason: unknown) => void = () => {};
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const owed: AuthSession = { user: null, status: "mfa_required", pendingAccountId: "a" };

function harness(status: AuthStatus = "authenticated") {
  const state = { status, notices: 0, rechecks: 0 };
  let pending = deferred<AuthSession>();
  const respond = createStepUpResponder({
    notify: () => state.notices++,
    getStatus: () => state.status,
    recheck: () => {
      state.rechecks++;
      return pending.promise;
    },
  });
  return {
    state,
    respond,
    finish(session: AuthSession = owed) {
      const current = pending;
      pending = deferred<AuthSession>();
      current.resolve(session);
    },
    fail() {
      const current = pending;
      pending = deferred<AuthSession>();
      current.reject(new Error("Failed to fetch"));
    },
  };
}

describe("createStepUpResponder", () => {
  it("says why at once, and asks for a fresh session", () => {
    const { state, respond } = harness();
    respond();
    expect(state).toMatchObject({ notices: 1, rechecks: 1 });
  });

  it("speaks for every refusal, but runs one recheck at a time", async () => {
    const h = harness();
    h.respond();
    h.respond(); // the same refusal, reported by a second mapper
    expect(h.state).toMatchObject({ notices: 2, rechecks: 1 });
    h.finish();
    await settle();
    h.respond();
    expect(h.state.rechecks).toBe(2);
  });

  it("still speaks when the recheck fails, and tries again on the next refusal", async () => {
    const h = harness();
    h.respond();
    h.fail();
    await settle();
    h.respond();
    expect(h.state).toMatchObject({ notices: 2, rechecks: 2 });
  });

  it("still speaks for a session that already owes its code, without asking again", () => {
    for (const status of ["mfa_required", "mfa_unconfirmed", "anonymous"] as const) {
      const { state, respond } = harness(status);
      respond();
      expect({ status, ...state }).toEqual({ status, notices: 1, rechecks: 0 });
    }
  });

  it("survives a recheck that throws before it returns a promise", async () => {
    let calls = 0;
    const respond = createStepUpResponder({
      notify: () => {},
      getStatus: () => "authenticated",
      recheck: () => {
        calls++;
        throw new Error("no client");
      },
    });
    respond();
    await settle();
    respond();
    expect(calls).toBe(2);
  });
});
