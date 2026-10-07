import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { UiTabs } from "./primitives";

type View = "calendar" | "standings" | "predictions";

const OPTIONS = [
  { value: "calendar" as const, label: "Calendrier" },
  { value: "standings" as const, label: "Classement" },
  { value: "predictions" as const, label: "Pronostics", disabled: true },
];

const render = (tabIntent?: (value: View) => undefined | Record<string, () => void>) =>
  renderToStaticMarkup(
    <UiTabs<View>
      value="calendar"
      onChange={() => {}}
      options={OPTIONS}
      label="Vues"
      idBase="views"
      tabIntent={tabIntent}
    />,
  );

describe("UiTabs loading a tab's page ahead (tabIntent)", () => {
  test("asks only for the tabs that are neither chosen nor disabled", () => {
    const asked: View[] = [];
    render((value) => {
      asked.push(value);
      return { onMouseEnter: () => {}, onMouseLeave: () => {}, onTouchStart: () => {} };
    });
    expect(asked).toEqual(["standings"]);
  });

  test("leaves the markup as it was: the same tabs, the same attributes", () => {
    const without = render();
    const withIntent = render(() => ({
      onMouseEnter: () => {},
      onMouseLeave: () => {},
      onTouchStart: () => {},
    }));
    expect(withIntent).toBe(without);
    expect(without).toContain('role="tablist"');
    expect(without.match(/role="tab"/g)).toHaveLength(3);
  });

  test("a tab whose handlers are undefined (no preloading) renders as before", () => {
    expect(render(() => undefined)).toBe(render());
  });
});
