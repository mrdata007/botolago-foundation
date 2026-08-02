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
