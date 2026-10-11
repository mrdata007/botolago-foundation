import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";

import { SplashScreen } from "./SplashScreen";
import { startMagicRings } from "./magic-rings";
import { WORDMARK_GLYPHS } from "./wordmark-glyphs";

const css = readFileSync(join(import.meta.dir, "../../styles.css"), "utf8");
const markup = renderToStaticMarkup(<SplashScreen onDone={() => {}} />);

/** The splash's own CSS: from its first rule to the live-strip rule after it. */
const splashCss = css.slice(
  css.indexOf(".splash-logo {"),
  css.indexOf("/* The live strip is showing"),
);

describe("premium splash: the server markup", () => {
  it("paints the logo before any JS: inline ball and every letter, one image to a reader", () => {
    expect(markup).toContain('role="img"');
    expect(markup).toContain('aria-label="BotolaGO"');
    expect(markup).toContain('dir="ltr"');
    expect((markup.match(/<svg/g) ?? []).length).toBe(WORDMARK_GLYPHS.length);
    expect((markup.match(/class="splash-ball"/g) ?? []).length).toBe(1);
    expect((markup.match(/data-glyph="arc"/g) ?? []).length).toBe(2);
    expect((markup.match(/data-glyph="letter"/g) ?? []).length).toBe(7);
    for (const glyph of WORDMARK_GLYPHS) expect(markup).toContain(glyph.d);
  });

  it("orders the letters outward from the ball: the nearest first", () => {
    const steps = WORDMARK_GLYPHS.filter((g) => g.kind === "letter").map((g) => g.step);
    expect(steps.slice().sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(WORDMARK_GLYPHS.find((g) => g.name === "G")?.step).toBe(0);
    expect(WORDMARK_GLYPHS.find((g) => g.name === "B")?.step).toBe(6);
  });

  it("puts the ball's travel in CSS custom properties, so no JS measures it", () => {
    expect(markup).toMatch(/--ball-dx:-?\d/);
    expect(markup).toMatch(/--ball-dy:-?\d/);
    expect(css).toContain("@keyframes splash-ball-scale");
    expect(css).toContain("--hero: 3.2");
  });

  it("keeps the status role, the gating class and the rings canvas", () => {
    expect(markup).toContain('role="status"');
    expect(markup).toContain("launch-splash fixed inset-0");
    expect(markup).toContain("<canvas");
  });

  it("has none of the old night-pitch layers", () => {
    expect(markup).not.toContain("<img");
    expect(markup).not.toContain("splash-lights");
    expect(css).not.toContain("splash-ball-x");
    expect(css).not.toContain("splash-ground-ripple");
    expect(css).not.toContain("splash-lights");
  });
});

describe("premium splash: reduced motion", () => {
  it("declares every animation under no-preference, so the default is the finished frame", () => {
    const start = splashCss.indexOf("@media (prefers-reduced-motion: no-preference) {");
    expect(start).toBeGreaterThan(-1);
    // Find the block's end by brace counting.
    let depth = 0;
    let end = start;
    for (let i = splashCss.indexOf("{", start); i < splashCss.length; i++) {
      if (splashCss[i] === "{") depth++;
      if (splashCss[i] === "}" && --depth === 0) {
        end = i;
        break;
      }
    }
    const outside = splashCss.slice(0, start) + splashCss.slice(end + 1);
    expect(outside).not.toMatch(/\banimation\s*:/);
    expect(splashCss.slice(start, end)).toMatch(/animation:/);
  });
});

describe("premium splash: the rings", () => {
  it("do nothing, and do not throw, when WebGL2 is unavailable", () => {
    const none = { getContext: () => null } as unknown as HTMLCanvasElement;
    const stop = startMagicRings(none, 0);
    expect(() => stop()).not.toThrow();
  });

  it("do nothing when asking for the context throws", () => {
    const throws = {
      getContext: () => {
        throw new Error("blocked");
      },
    } as unknown as HTMLCanvasElement;
    expect(() => startMagicRings(throws, 0)()).not.toThrow();
  });
});
