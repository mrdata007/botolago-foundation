import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { RevealOnArrive } from "./RevealOnArrive";

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
});
