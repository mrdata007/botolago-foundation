import { describe, expect, it } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { UiTabs } from "./primitives";
import { rovingTabStop, rovingTarget, type RovingOption } from "./tabs-keyboard";

/**
 * `UiTabs` keyboard behaviour (the WAI-ARIA tabs pattern) and the markup
 * contract screen lanes rely on (`${idBase}-tab-${value}` for a panel's
 * `aria-labelledby`). The repository has no DOM test environment, so the
 * arithmetic is tested as the pure functions `UiTabs` calls, and the markup
 * through `react-dom/server`.
 */

type Tab = "summary" | "stats" | "lineups" | "h2h";
const TABS: RovingOption<Tab>[] = [
  { value: "summary" },
  { value: "stats" },
  { value: "lineups" },
  { value: "h2h" },
];
const key = (
  name: string,
  mods: Partial<Record<"altKey" | "ctrlKey" | "metaKey", boolean>> = {},
) => ({
  key: name,
  ...mods,
});

describe("UiTabs roving focus — the tab stop", () => {
  it("is the selected tab", () => {
    expect(rovingTabStop(TABS, "lineups")).toBe("lineups");
  });

  it("falls back to the first enabled tab when the selection is disabled", () => {
    const options: RovingOption<Tab>[] = [
      { value: "summary", disabled: true },
      { value: "stats" },
      { value: "lineups", disabled: true },
      { value: "h2h" },
    ];
    expect(rovingTabStop(options, "lineups")).toBe("stats");
  });

  it("falls back to the first enabled tab when the selection is not an option", () => {
    expect(rovingTabStop(TABS, "missing" as Tab)).toBe("summary");
  });

  it("is undefined only when every tab is disabled", () => {
    expect(
      rovingTabStop(
        TABS.map((tab) => ({ ...tab, disabled: true })),
        "summary",
      ),
    ).toBeUndefined();
  });
});

describe("UiTabs roving focus — where a key goes", () => {
  it("moves ArrowRight forward and ArrowLeft back in LTR, wrapping at both ends", () => {
    expect(rovingTarget(TABS, key("ArrowRight"), "summary", "summary", false)).toBe("stats");
    expect(rovingTarget(TABS, key("ArrowLeft"), "stats", "summary", false)).toBe("summary");
    expect(rovingTarget(TABS, key("ArrowRight"), "h2h", "h2h", false)).toBe("summary");
    expect(rovingTarget(TABS, key("ArrowLeft"), "summary", "summary", false)).toBe("h2h");
  });

  it("flips the arrows under RTL, so 'next' is always the reading direction", () => {
    // In Arabic the next tab sits to the LEFT: ArrowLeft moves forward.
    expect(rovingTarget(TABS, key("ArrowLeft"), "summary", "summary", true)).toBe("stats");
    expect(rovingTarget(TABS, key("ArrowRight"), "stats", "stats", true)).toBe("summary");
    expect(rovingTarget(TABS, key("ArrowLeft"), "h2h", "h2h", true)).toBe("summary");
    expect(rovingTarget(TABS, key("ArrowRight"), "summary", "summary", true)).toBe("h2h");
  });

  it("jumps to the first and last enabled tab on Home and End, in both directions", () => {
    for (const rtl of [false, true]) {
      expect(rovingTarget(TABS, key("Home"), "lineups", "lineups", rtl)).toBe("summary");
      expect(rovingTarget(TABS, key("End"), "stats", "stats", rtl)).toBe("h2h");
    }
  });

  it("skips disabled tabs, including at the ends", () => {
    const options: RovingOption<Tab>[] = [
      { value: "summary", disabled: true },
      { value: "stats" },
      { value: "lineups", disabled: true },
      { value: "h2h" },
    ];
    expect(rovingTarget(options, key("ArrowRight"), "stats", "stats", false)).toBe("h2h");
    expect(rovingTarget(options, key("ArrowRight"), "h2h", "h2h", false)).toBe("stats");
    expect(rovingTarget(options, key("Home"), "h2h", "h2h", false)).toBe("stats");
    expect(rovingTarget(options, key("End"), "stats", "stats", false)).toBe("h2h");
  });

  it("moves from the focused tab, not the selected one", () => {
    // Focus can sit on a tab other than the selection (a click elsewhere
    // selected it, or the selection was set programmatically).
    expect(rovingTarget(TABS, key("ArrowRight"), "lineups", "summary", false)).toBe("h2h");
  });

  it("starts from the tab stop when focus is not on an enabled tab", () => {
    const options: RovingOption<Tab>[] = [
      { value: "summary" },
      { value: "stats", disabled: true },
      { value: "lineups" },
      { value: "h2h" },
    ];
    // Selection disabled → the stop is "summary"; forward is the next one,
    // back wraps to the last — not an index computed from -1.
    expect(rovingTarget(options, key("ArrowRight"), undefined, "stats", false)).toBe("lineups");
    expect(rovingTarget(options, key("ArrowLeft"), undefined, "stats", false)).toBe("h2h");
  });

  it("leaves a modified key to the browser (Alt+Arrow is Back/Forward)", () => {
    for (const mod of ["altKey", "ctrlKey", "metaKey"] as const) {
      for (const name of ["ArrowLeft", "ArrowRight", "Home", "End"]) {
        expect({
          mod,
          name,
          target: rovingTarget(TABS, key(name, { [mod]: true }), "stats", "stats", false),
        }).toEqual({
          mod,
          name,
          target: null,
        });
      }
    }
  });

  it("ignores keys that are not the tablist's, and a tablist with nothing enabled", () => {
    for (const name of ["Tab", "Enter", " ", "ArrowUp", "ArrowDown", "a"]) {
      expect(rovingTarget(TABS, key(name), "stats", "stats", false)).toBeNull();
    }
    const none = TABS.map((tab) => ({ ...tab, disabled: true }));
    expect(rovingTarget(none, key("ArrowRight"), undefined, "stats", false)).toBeNull();
  });
});

describe("UiTabs markup", () => {
  const render = (value: Tab, options = TABS) =>
    renderToStaticMarkup(
      createElement(UiTabs<Tab>, {
        value,
        onChange: () => {},
        label: "Match sections",
        idBase: "match",
        options: options.map((option) => ({
          ...option,
          label: option.value,
          panelId: `match-panel-${option.value}`,
        })),
      }),
    );

  /** Every `<button …>` opening tag, in order. */
  const buttons = (html: string) => [...html.matchAll(/<button\b[^>]*>/g)].map((m) => m[0]);

  it("is a named tablist of tabs with the documented ids and aria-controls", () => {
    const html = render("stats");
    expect(html).toMatch(/<div role="tablist" aria-label="Match sections"/);
    const tags = buttons(html);
    expect(tags).toHaveLength(4);
    TABS.forEach((tab, index) => {
      expect(tags[index]).toContain(`id="match-tab-${tab.value}"`);
      expect(tags[index]).toContain('role="tab"');
      expect(tags[index]).toContain(`aria-controls="match-panel-${tab.value}"`);
    });
  });

  it("marks only the selected tab selected and gives it the only tab stop", () => {
    const tags = buttons(render("lineups"));
    expect(tags.map((tag) => /aria-selected="true"/.test(tag))).toEqual([
      false,
      false,
      true,
      false,
    ]);
    expect(tags.map((tag) => /tabindex="0"/i.test(tag))).toEqual([false, false, true, false]);
    expect(tags.filter((tag) => /tabindex="-1"/i.test(tag))).toHaveLength(3);
  });

  it("moves the tab stop to the first enabled tab when the selection is disabled", () => {
    const options: RovingOption<Tab>[] = [
      { value: "summary", disabled: true },
      { value: "stats" },
      { value: "lineups", disabled: true },
      { value: "h2h" },
    ];
    const tags = buttons(render("lineups", options));
    expect(tags.map((tag) => /tabindex="0"/i.test(tag))).toEqual([false, true, false, false]);
    expect(tags[2]).toContain('aria-selected="true"');
    expect(tags[2]).toContain("disabled");
  });
});
