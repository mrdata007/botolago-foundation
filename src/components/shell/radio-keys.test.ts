import { describe, expect, it } from "bun:test";

import { radioKeyTarget } from "./radio-keys";

/**
 * The first-launch language chooser is a radio group (audit 2026-09-25,
 * A12), so the arrows move its one choice — the WAI-ARIA radio group
 * keyboard, tested as the pure function the component calls.
 */

const LANGS = ["fr", "ar"] as const;
const key = (
  name: string,
  mods: Partial<Record<"altKey" | "ctrlKey" | "metaKey", boolean>> = {},
) => ({
  key: name,
  ...mods,
});

describe("radioKeyTarget", () => {
  it("moves down and up the list, wrapping at both ends", () => {
    expect(radioKeyTarget(LANGS, key("ArrowDown"), "fr", false)).toBe("ar");
    expect(radioKeyTarget(LANGS, key("ArrowDown"), "ar", false)).toBe("fr");
    expect(radioKeyTarget(LANGS, key("ArrowUp"), "fr", false)).toBe("ar");
    expect(radioKeyTarget(LANGS, key("ArrowUp"), "ar", false)).toBe("fr");
  });

  it("treats Right as next and Left as previous left-to-right", () => {
    const three = ["a", "b", "c"] as const;
    expect(radioKeyTarget(three, key("ArrowRight"), "a", false)).toBe("b");
    expect(radioKeyTarget(three, key("ArrowLeft"), "a", false)).toBe("c");
  });

  it("follows the reading direction right-to-left: Left is next", () => {
    const three = ["a", "b", "c"] as const;
    expect(radioKeyTarget(three, key("ArrowLeft"), "a", true)).toBe("b");
    expect(radioKeyTarget(three, key("ArrowRight"), "a", true)).toBe("c");
    // Up and Down follow the list, whatever the direction.
    expect(radioKeyTarget(three, key("ArrowDown"), "a", true)).toBe("b");
    expect(radioKeyTarget(three, key("ArrowUp"), "a", true)).toBe("c");
  });

  it("leaves every other key alone, including Tab, Space and Enter", () => {
    for (const name of ["Tab", " ", "Enter", "Home", "End", "a", "Escape"]) {
      expect(radioKeyTarget(LANGS, key(name), "fr", false)).toBeNull();
    }
  });

  it("leaves modified arrows to the browser and the OS", () => {
    expect(radioKeyTarget(LANGS, key("ArrowLeft", { altKey: true }), "fr", false)).toBeNull();
    expect(radioKeyTarget(LANGS, key("ArrowDown", { ctrlKey: true }), "fr", false)).toBeNull();
    expect(radioKeyTarget(LANGS, key("ArrowUp", { metaKey: true }), "fr", false)).toBeNull();
  });

  it("does not trip over an inherited property name", () => {
    expect(radioKeyTarget(LANGS, key("toString"), "fr", false)).toBeNull();
  });

  it("starts from the first option when the focused one is unknown, and handles no options", () => {
    expect(radioKeyTarget(["a", "b", "c"], key("ArrowDown"), "z", false)).toBe("b");
    expect(radioKeyTarget([], key("ArrowDown"), "z", false)).toBeNull();
  });
});
