import { describe, expect, it } from "bun:test";
import { attachLeaveWarning } from "./leave-warning";

/** A window that only records which listeners are attached. */
function fakeWindow() {
  const listeners = new Map<string, Set<(event: any) => void>>();
  return {
    listeners,
    addEventListener: (type: string, fn: (event: any) => void) => {
      listeners.set(type, (listeners.get(type) ?? new Set()).add(fn));
    },
    removeEventListener: (type: string, fn: (event: any) => void) => {
      listeners.get(type)?.delete(fn);
    },
    count: (type: string) => listeners.get(type)?.size ?? 0,
    fire: (type: string) => {
      const event = { defaultPrevented: false, returnValue: "unset", preventDefault() {} };
      event.preventDefault = () => {
        event.defaultPrevented = true;
      };
      for (const fn of listeners.get(type) ?? []) fn(event);
      return event;
    },
  };
}

describe("attachLeaveWarning (the squad builder's confirm-before-leaving)", () => {
  it("adds nothing while the draft is safe", () => {
    const win = fakeWindow();
    const stop = attachLeaveWarning(win as any, false);
    expect(win.count("beforeunload")).toBe(0);
    stop();
  });

  it("asks the browser to confirm, with both preventDefault and returnValue", () => {
    const win = fakeWindow();
    attachLeaveWarning(win as any, true);
    expect(win.count("beforeunload")).toBe(1);
    const event = win.fire("beforeunload");
    expect(event.defaultPrevented).toBe(true);
    expect(event.returnValue).toBe("");
  });

  it("stops asking when the screen goes away or the draft is no longer at risk", () => {
    const win = fakeWindow();
    const stop = attachLeaveWarning(win as any, true);
    stop();
    expect(win.count("beforeunload")).toBe(0);
    expect(win.fire("beforeunload").defaultPrevented).toBe(false);
  });
});
