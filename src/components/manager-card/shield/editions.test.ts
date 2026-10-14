import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { crackle, editionFx, pixelField } from "./editions";

const CSS = readFileSync(join(import.meta.dir, "shield.css"), "utf8");

/** The stylesheet with every `no-preference` block cut out (balanced braces). */
function outsideMotion(css: string): string {
  const marker = "@media (prefers-reduced-motion: no-preference)";
  let out = "";
  let i = 0;
  while (i < css.length) {
    const at = css.indexOf(marker, i);
    if (at < 0) return out + css.slice(i);
    out += css.slice(i, at);
    let depth = 0;
    let j = css.indexOf("{", at);
    for (; j < css.length; j++) {
      if (css[j] === "{") depth++;
      else if (css[j] === "}" && --depth === 0) break;
    }
    i = j + 1;
  }
  return out;
}

describe("the editions' motion", () => {
  it("has no animation and no keyframes outside prefers-reduced-motion: no-preference", () => {
    const still = outsideMotion(CSS);
    expect(still).not.toMatch(/animation\s*:/);
    expect(still).not.toMatch(/@keyframes/);
  });

  it("animates the full card only: every edition animation is off the compact and cropped cards", () => {
    const editionsCss = CSS.slice(CSS.indexOf("The paid editions (BotolaGO+)"));
    const rules = [...editionsCss.matchAll(/([^{}]+)\{\s*animation(?:-delay)?:/g)].map((m) =>
      m[1]!.trim(),
    );
    expect(rules.length).toBeGreaterThan(8);
    for (const selector of rules) {
      expect(selector, selector).toContain(":not(.mc-shield--compact):not(.mc-shield--cropped)");
    }
  });

  it("never animates the number, the text layer or the serial", () => {
    const editionsCss = CSS.slice(CSS.indexOf("The paid editions (BotolaGO+)"));
    for (const cls of ["mc-sl--num", "mc-sl--text", "mc-shield__ovr", "mc-shield__serial"]) {
      expect(editionsCss).not.toMatch(new RegExp(`\\.${cls}[^{]*\\{\\s*animation`));
    }
  });

  it("draws the crackle as still filtered copies, with no SMIL for the media query to miss", () => {
    const html = crackle();
    expect(html).not.toMatch(/<animate|<set|begin=/);
    expect(html.match(/seed="/g)).toHaveLength(6);
  });

  it("draws the pixel field the same every time (seeded) and adds no layer to a free card", () => {
    const norm = (s: string) => s.replace(/mc-px-\d+/g, "P");
    expect(norm(pixelField())).toBe(norm(pixelField()));
    expect(editionFx(null)).toEqual({ under: "", over: "" });
  });
});
