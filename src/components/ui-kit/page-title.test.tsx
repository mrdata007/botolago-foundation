import { describe, expect, it } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { UiPageTitle } from "./primitives";

/**
 * The hub title band keeps the route name under tight space (audit VIS-001).
 *
 * The heading used to carry `truncate` and sit beside a `shrink-0` control on
 * one non-wrapping row, so the control kept its width and the heading was
 * squeezed to an ellipsis, or to nothing: measured in a browser at 200% text
 * size, the Matches heading was 0px wide at 320px and 65px wide at 390px, and
 * French "Notifications" was cut at every phone width. There is no DOM test
 * environment here, so this reads the rendered markup; the widths themselves
 * were measured in Chromium (see the Phase C report, lane C5).
 */
function render(props: { title: string; withTrailing?: boolean }) {
  return renderToStaticMarkup(
    createElement(UiPageTitle, {
      title: props.title,
      trailing: props.withTrailing
        ? createElement("button", { type: "button" }, "2026/2027")
        : null,
    }),
  );
}

function classOf(html: string, tag: string): string {
  const match = new RegExp(`<${tag}[^>]*class="([^"]*)"`).exec(html);
  if (!match) throw new Error(`no <${tag} class> in ${html}`);
  return match[1] ?? "";
}

describe("UiPageTitle under constrained space", () => {
  it("never cuts the heading to an ellipsis", () => {
    const heading = classOf(render({ title: "Notifications", withTrailing: true }), "h1");
    expect(heading.split(/\s+/)).not.toContain("truncate");
    expect(heading).not.toMatch(/\btext-ellipsis\b|\bline-clamp-\d|\bwhitespace-nowrap\b/);
  });

  it("lets a heading wider than the row wrap, even inside one long word", () => {
    const heading = classOf(render({ title: "Notifications" }), "h1").split(/\s+/);
    expect(heading).toContain("min-w-0");
    expect(heading).toContain("break-words");
  });

  it("lets the control drop to a second line instead of squeezing the heading", () => {
    const html = render({ title: "Matches", withTrailing: true });
    const row = html.match(/<div class="([^"]*)"><h1/)?.[1] ?? "";
    expect(row.split(/\s+/)).toContain("flex-wrap");
    // The control keeps its size and sits at the inline end, alone on its line too.
    const trailing = html.match(/<\/h1><div class="([^"]*)"/)?.[1] ?? "";
    expect(trailing.split(/\s+/)).toContain("shrink-0");
    expect(trailing.split(/\s+/)).toContain("ms-auto");
  });

  it("keeps the title and the control and the 44px row", () => {
    const html = render({ title: "Matches", withTrailing: true });
    expect(html).toContain(">Matches</h1>");
    expect(html).toContain("2026/2027");
    expect(html).toContain("min-h-[var(--ui-tap-min)]");
  });

  it("uses logical spacing only, so Arabic mirrors", () => {
    const html = render({ title: "المباريات", withTrailing: true });
    // Physical utilities: ml-, mr-, pl-, pr-, left-, right-, and the two text alignments.
    expect(html).not.toMatch(/class="[^"]*\b(?:ml|mr|pl|pr|left|right)-/);
    expect(html).not.toMatch(/class="[^"]*\btext-(?:le|ri)ght\b/);
  });
});
