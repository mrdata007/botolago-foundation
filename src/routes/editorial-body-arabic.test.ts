import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Audit 2026-10-14, LOC-08: an Arabic edition read from the French shell took
 * its body face from the shell (Manrope, which has no Arabic: a real render
 * drew the Arabic letters in DejaVu Sans, the machine's fallback, not Noto
 * Sans Arabic), and its emphasis was slanted although the Arabic face ships
 * upright only (the browser shears the letters).
 *
 * The real rendering was measured in a browser when the rules were written
 * (computed style and the font the engine actually used, French shell, Arabic
 * edition). This is the source-level guard: it pins the rules, so they cannot
 * be dropped or widened to every italic unnoticed.
 */
const root = join(import.meta.dir, "..", "..");
const css = readFileSync(join(root, "src/styles.css"), "utf8");

/** The declarations of the rule whose selector list is exactly `selector`. */
function declarations(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  const match = css.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`));
  expect({ selector, found: match !== null }).toEqual({ selector, found: true });
  return match?.[1] ?? "";
}

describe("editorial body, content language", () => {
  it("sets an Arabic edition in the Arabic face, whatever the shell", () => {
    const rule = declarations(".editorial-body:lang(ar)");
    expect(rule).toContain("font-family: var(--font-arabic)");
    expect(rule).toContain("font-synthesis-style: none");
  });

  it("sets a French edition in the French face, whatever the shell", () => {
    expect(declarations(".editorial-body:lang(fr)")).toContain("font-family: var(--font-sans)");
  });

  it("draws Arabic emphasis upright and heavier, as emphasis", () => {
    const rule = declarations(".editorial-body em:lang(ar),\n.editorial-body i:lang(ar)");
    expect(rule).toContain("font-style: normal");
    expect(rule).toContain("font-weight: bolder");
    expect(rule).toContain("font-synthesis-style: none");
    // Semantics stay: the markup is still <em>; only its drawing changes.
    expect(rule).not.toContain("display");
  });

  it("keeps an Arabic quote upright", () => {
    expect(declarations(".editorial-body blockquote:lang(ar)")).toContain("font-style: normal");
  });

  it("leaves Latin italics alone", () => {
    expect(declarations(".editorial-body em")).toContain("font-style: italic");
    // No other rule turns off italics for em/i/blockquote outside Arabic.
    const offRules = [
      ...css.matchAll(
        /([^{}]*editorial-body[^{}]*(?:em|\bi\b)[^{}]*)\{([^}]*font-style:\s*normal[^}]*)\}/g,
      ),
    ];
    for (const [, selector] of offRules) {
      expect(selector).toContain(":lang(ar)");
    }
  });

  it("is keyed on the language the article page puts on its subtree", () => {
    const page = readFileSync(join(root, "src/routes/news.$articleId.tsx"), "utf8");
    expect(page).toMatch(/<article[^>]*lang=\{contentLanguage\}/);
  });
});
