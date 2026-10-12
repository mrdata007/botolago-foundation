import { readFileSync } from "node:fs";
import { describe, expect, it } from "bun:test";

const read = (path: string) => readFileSync(path, "utf8");

/**
 * docs/engineering/MOTION_CALM_SCREENS.md: a page, a section and a tab panel
 * are drawn on their first frame, and a page transition never fades the page
 * being left (which, with the new page fading in too, washed the screen grey).
 */
describe("calm screens", () => {
  it("Section does not animate in from opacity 0", () => {
    const source = read("src/components/common/Section.tsx");
    expect(source).not.toMatch(/animate-in|fade-in|slide-in|enter-rise/);
  });

  it("no tab panel fades in", () => {
    expect(read("src/styles.css")).not.toContain("tab-panel-in");
  });

  it("the old page of a view transition is not animated and nothing is blended additively", () => {
    const css = read("src/styles.css");
    expect(css).toMatch(/::view-transition-old\(root\)\s*\{\s*animation:\s*none;/);
    expect(css).not.toMatch(/vt-out-/);
    expect(css).toMatch(/mix-blend-mode:\s*normal/);
  });
});
