import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { RevealFrame, RevealOnArrive, type Phase } from "./RevealOnArrive";

/**
 * The rule that matters: a block present at first render (cached or
 * server-rendered data) is drawn at full size with no animation. The
 * animated path only starts from an effect, after a `show` that turned true
 * later, so a first render never carries the collapsed styles.
 */
describe("RevealOnArrive", () => {
  it("present at first render: full size, no grid collapse, no transition", () => {
    const html = renderToStaticMarkup(
      <RevealOnArrive show>
        <p>strip</p>
      </RevealOnArrive>,
    );
    expect(html).toContain("<p>strip</p>");
    expect(html).not.toMatch(/grid-template-rows|opacity|transition|overflow-hidden/);
  });

  it("transparent adds no box at rest", () => {
    const html = renderToStaticMarkup(
      <RevealOnArrive show transparent>
        <p>strip</p>
      </RevealOnArrive>,
    );
    expect(html).toContain("contents");
  });

  it("renders nothing while absent", () => {
    expect(
      renderToStaticMarkup(
        <RevealOnArrive show={false}>
          <p>strip</p>
        </RevealOnArrive>,
      ),
    ).toBe("");
  });

  it("keeps the same element hierarchy in every phase, so children never remount", () => {
    // The markup with every attribute removed: the tag skeleton around the child.
    const skeleton = (phase: Phase, transparent: boolean) =>
      renderToStaticMarkup(
        <RevealFrame phase={phase} transparent={transparent}>
          <p>strip</p>
        </RevealFrame>,
      ).replace(/ [a-z-]+="[^"]*"/g, "");
    for (const transparent of [true, false]) {
      const shapes = (["rest", "from", "to"] as const).map((p) => skeleton(p, transparent));
      expect(new Set(shapes).size).toBe(1);
      expect(shapes[0]).toBe("<div><div><p>strip</p></div></div>");
    }
  });

  it("the component renders its children through that one frame", () => {
    const html = renderToStaticMarkup(
      <RevealOnArrive show transparent>
        <p>strip</p>
      </RevealOnArrive>,
    );
    expect(html.replace(/ [a-z-]+="[^"]*"/g, "")).toBe("<div><div><p>strip</p></div></div>");
  });
});
