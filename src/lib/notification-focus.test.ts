import { describe, expect, it } from "bun:test";

import { dismissFocusTarget, moveFocusAfterDismiss, type FocusRoot } from "./notification-focus";

const IDS = ["a", "b", "c"];

describe("dismissFocusTarget", () => {
  it("goes to the next card", () => {
    expect(dismissFocusTarget(IDS, "a")).toEqual({ kind: "card", id: "b", relation: "next" });
    expect(dismissFocusTarget(IDS, "b")).toEqual({ kind: "card", id: "c", relation: "next" });
  });
  it("goes to the previous card when the last one is dismissed", () => {
    expect(dismissFocusTarget(IDS, "c")).toEqual({ kind: "card", id: "b", relation: "previous" });
  });
  it("goes to the heading when it was the only card", () => {
    expect(dismissFocusTarget(["a"], "a")).toEqual({ kind: "heading" });
  });
  it("goes to the heading for an unknown card in an empty list", () => {
    expect(dismissFocusTarget([], "a")).toEqual({ kind: "heading" });
  });
});

type Fake = {
  focused: string[];
  tabIndex?: number;
  contains: (node: unknown) => boolean;
  closest: (selector: string) => Fake | null;
  focus: () => void;
  name: string;
};

/** A document with one `li` per card, each holding its dismiss button. */
function fakeRoot(ids: string[], activeName: string | null) {
  const focusLog: string[] = [];
  const make = (name: string): Fake => ({
    name,
    focused: focusLog,
    contains: () => false,
    closest: () => null,
    focus: () => focusLog.push(name),
  });
  const buttons = new Map<string, Fake>();
  const items = new Map<string, Fake>();
  for (const id of ids) {
    const button = make(`dismiss:${id}`);
    const li = make(`li:${id}`);
    li.contains = (node) => node === button;
    button.closest = () => li;
    buttons.set(id, button);
    items.set(id, li);
  }
  const heading = make("h1");
  const body = make("body");
  const named = new Map<string, Fake>([
    ...[...buttons].map(([, b]) => [b.name, b] as const),
    ["h1", heading],
    ["body", body],
  ]);
  const root = {
    body: body as unknown as Element,
    activeElement: (activeName ? named.get(activeName) : null) as unknown as Element | null,
    querySelector: (selector: string) => {
      if (selector === "h1") return heading as unknown as Element;
      const match = /data-dismiss-id="(.*)"/.exec(selector);
      return ((match ? buttons.get(match[1]!) : undefined) as unknown as Element | null) ?? null;
    },
  } satisfies FocusRoot;
  return { root, focusLog, heading };
}

describe("moveFocusAfterDismiss", () => {
  it("focuses the next card's dismiss button", () => {
    const { root, focusLog } = fakeRoot(IDS, "dismiss:a");
    expect(moveFocusAfterDismiss(root, IDS, "a")).toEqual({
      kind: "card",
      id: "b",
      relation: "next",
    });
    expect(focusLog).toEqual(["dismiss:b"]);
  });
  it("focuses the previous card when the last is dismissed", () => {
    const { root, focusLog } = fakeRoot(IDS, "dismiss:c");
    expect(moveFocusAfterDismiss(root, IDS, "c")?.kind).toBe("card");
    expect(focusLog).toEqual(["dismiss:b"]);
  });
  it("focuses the heading (made focusable) when none is left", () => {
    const { root, focusLog, heading } = fakeRoot(["a"], "dismiss:a");
    expect(moveFocusAfterDismiss(root, ["a"], "a")).toEqual({ kind: "heading" });
    expect(focusLog).toEqual(["h1"]);
    expect(heading.tabIndex).toBe(-1);
  });
  it("leaves focus alone when it was on the body (a click that focused nothing)", () => {
    const { root, focusLog } = fakeRoot(IDS, "body");
    expect(moveFocusAfterDismiss(root, IDS, "a")).toBeNull();
    expect(focusLog).toEqual([]);
  });
  it("leaves focus alone when it was on another card", () => {
    const { root, focusLog } = fakeRoot(IDS, "dismiss:c");
    expect(moveFocusAfterDismiss(root, IDS, "a")).toBeNull();
    expect(focusLog).toEqual([]);
  });
});
