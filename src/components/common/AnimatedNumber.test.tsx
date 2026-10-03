import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { AnimatedNumber, FlashOnChange } from "./AnimatedNumber";

describe("AnimatedNumber", () => {
  it("shows the finished value on first render, with no flash", () => {
    const html = renderToStaticMarkup(
      <AnimatedNumber value={1234} format={(n) => `n=${n}`} className="x" />,
    );
    expect(html).toBe('<span class="x">n=1234</span>');
  });
});

describe("FlashOnChange", () => {
  it("renders its children untouched on first render", () => {
    const html = renderToStaticMarkup(<FlashOnChange value={3}>3e</FlashOnChange>);
    expect(html).toBe("<span>3e</span>");
  });
});
