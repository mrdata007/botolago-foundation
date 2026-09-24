import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";

function tagName(node: ts.JsxTagNameExpression): string {
  return node.getText();
}

describe("ArticleCard interaction semantics", () => {
  it("never nests a SavedButton inside a router Link", () => {
    const sourceText = readFileSync(new URL("./ArticleCard.tsx", import.meta.url), "utf8");
    const source = ts.createSourceFile(
      "ArticleCard.tsx",
      sourceText,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const invalid: number[] = [];
    let savedButtons = 0;

    const visit = (node: ts.Node, ancestors: readonly string[]) => {
      let nextAncestors = ancestors;
      if (ts.isJsxElement(node)) {
        nextAncestors = [...ancestors, tagName(node.openingElement.tagName)];
      } else if (ts.isJsxSelfClosingElement(node)) {
        const name = tagName(node.tagName);
        if (name === "SavedButton") {
          savedButtons += 1;
          if (ancestors.includes("Link")) invalid.push(node.getStart(source));
        }
      }
      ts.forEachChild(node, (child) => visit(child, nextAncestors));
    };

    visit(source, []);
    expect(savedButtons).toBeGreaterThan(0);
    expect(invalid).toEqual([]);
  });
});

describe("ArticleCard follows the house rules (Option A)", () => {
  // Comments are stripped: the card explains the rules it follows in prose.
  const code = readFileSync(new URL("./ArticleCard.tsx", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

  it("uses logical edges only, so a card mirrors in Arabic", () => {
    expect(code).not.toMatch(/(^|[\s"'`])-?(ml|mr|pl|pr|left|right)-[\w.[\]/-]+/m);
    expect(code).not.toMatch(/\btext-(left|right)\b/);
    expect(code).not.toMatch(/\bborder-(l|r)(-[\w.[\]/-]+)?(?![\w-])/);
    expect(code).not.toMatch(/\brounded-(tl|tr|bl|br|l|r)-/);
  });

  it("letter-spaces nothing unless ltr:", () => {
    const offenders = [...code.matchAll(/(.{0,4})tracking-[\w[\]./-]+/g)]
      .filter((match) => !match[1].endsWith("ltr:"))
      .map((match) => match[0].trim());
    expect(offenders).toEqual([]);
  });

  it("hardcodes no colour and never writes the ink fill as text (BG-0083)", () => {
    expect(code).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(code).not.toMatch(/\brgba?\(/);
    expect(code).not.toMatch(/\b(bg|text|border|ring)-(white|black)\b/);
    expect(code).not.toContain("text-[color:var(--ui-ink)]");
  });

  it("runs every gradient to bottom: an angle or a side is a physical direction", () => {
    expect(code).not.toMatch(/-?\d+(\.\d+)?deg/);
    expect(code).not.toMatch(/to (left|right)/);
    expect(code).toContain("linear-gradient(to bottom");
  });
});
