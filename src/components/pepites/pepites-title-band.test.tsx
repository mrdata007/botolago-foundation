import { describe, expect, it } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { I18nProvider } from "@/i18n/provider";

import { PepitesPageTitle } from "./PepitesShell";

/**
 * The Pépites title band under enlarged text (lane C5 review).
 *
 * `UiPageTitle`'s row wraps so its control can drop to a second line. A Pépites
 * heading with a flex basis of `0` (plain `flex-1`) always "fits" beside the
 * buttons however little room it has, so they never wrap: at 200% text size
 * the heading was squeezed to 40px at 320px wide and broke into 8 to 16 lines.
 * The basis has to be a real width (`5em`), so the buttons move down once the
 * heading has less than that left. There is no DOM test environment, so this
 * reads the rendered classes; the widths were measured in Chromium.
 */
function band() {
  return renderToStaticMarkup(
    createElement(
      I18nProvider,
      null,
      createElement(PepitesPageTitle, {
        title: "Top 10 · Semaine 15",
        trailing: createElement("button", { type: "button" }, "Partager"),
      }),
    ),
  );
}

describe("PepitesPageTitle's heading", () => {
  const html = band();
  const bandClass = /<div class="([^"]*)"><div class="[^"]*"><div class="[^"]*flex-wrap/
    .exec(html)?.[1]
    ?.replaceAll("&amp;", "&");

  it("is found in the markup", () => {
    expect(bandClass).toBeDefined();
    expect(html).toContain(">Top 10 · Semaine 15</h1>");
  });

  it("fills the row from a real basis, never from zero", () => {
    expect(bandClass).toContain("[&_:is(h1,h2)]:flex-[1_1_5em]");
    // `flex-1` is `flex: 1 1 0%`: the heading would never lose room to the buttons.
    expect(bandClass?.split(/\s+/)).not.toContain("[&_:is(h1,h2)]:flex-1");
  });

  it("still wraps its text and keeps the buttons on a row that can wrap", () => {
    expect(bandClass).toContain("[&_:is(h1,h2)]:whitespace-normal");
    expect(html).toContain("flex-wrap");
    expect(html).toContain(">Partager</button>");
  });
});
