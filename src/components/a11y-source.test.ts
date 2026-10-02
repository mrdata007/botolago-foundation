import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import ts from "typescript";

// A source-level guard for two accessibility rules, so they cannot slip back
// in unnoticed:
//
//   1. Every image says what it is, or says it is decoration. An `<img>` (or
//      `FailureAwareImage`, `MediaImage`) with no `alt` at all is announced
//      by its file name; `alt=""` is the deliberate "decorative" answer.
//   2. A raw `<button>` whose only content is an icon carries an
//      `aria-label`. (`UiIconButton` requires one in its type, and
//      `UiBackButton` always prints its name, so neither needs checking.)
//
// A DOM audit needs a browser, which `bun test` has not got; this reads the
// JSX instead.

const IMAGE_TAGS = new Set(["img", "FailureAwareImage", "MediaImage"]);

function* sourceFiles(): Generator<string> {
  for (const file of new Bun.Glob("src/**/*.tsx").scanSync(".")) {
    if (!file.includes(".test.")) yield file;
  }
}

function jsxName(node: ts.JsxOpeningLikeElement): string {
  return node.tagName.getText();
}

function hasAttribute(node: ts.JsxOpeningLikeElement, name: string): boolean {
  return node.attributes.properties.some(
    (attribute) => ts.isJsxAttribute(attribute) && attribute.name.getText() === name,
  );
}

function hasSpread(node: ts.JsxOpeningLikeElement): boolean {
  return node.attributes.properties.some((attribute) => ts.isJsxSpreadAttribute(attribute));
}

/** The props an icon takes. Anything else (`label`, `value`, ...) means the element carries text of its own. */
const ICON_PROPS = new Set(["className", "aria-hidden", "strokeWidth", "size", "width", "height"]);

/** True when a `<button>`'s children are nothing but icon elements and whitespace. */
function isIconOnly(element: ts.JsxElement): boolean {
  let sawIcon = false;
  for (const child of element.children) {
    if (ts.isJsxText(child)) {
      if (child.text.trim() !== "") return false;
    } else if (ts.isJsxSelfClosingElement(child)) {
      // An icon is a capitalised self-closing component that takes only
      // styling props; one with a `label` or the like says something itself.
      if (!/^[A-Z]/.test(child.tagName.getText())) return false;
      const plain = child.attributes.properties.every(
        (attribute) => ts.isJsxAttribute(attribute) && ICON_PROPS.has(attribute.name.getText()),
      );
      if (!plain) return false;
      sawIcon = true;
    } else {
      return false;
    }
  }
  return sawIcon;
}

function audit() {
  const images: string[] = [];
  const unnamedButtons: string[] = [];
  for (const file of sourceFiles()) {
    const tree = ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const where = (node: ts.Node) =>
      `${file}:${tree.getLineAndCharacterOfPosition(node.getStart()).line + 1}`;
    const visit = (node: ts.Node) => {
      if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
        if (IMAGE_TAGS.has(jsxName(node)) && !hasAttribute(node, "alt") && !hasSpread(node)) {
          images.push(`${where(node)} <${jsxName(node)}>`);
        }
      }
      if (ts.isJsxElement(node) && jsxName(node.openingElement) === "button") {
        const opening = node.openingElement;
        const named =
          hasAttribute(opening, "aria-label") || hasAttribute(opening, "aria-labelledby");
        if (!named && !hasSpread(opening) && isIconOnly(node)) {
          unnamedButtons.push(`${where(node)} <button>`);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(tree);
  }
  return { images, unnamedButtons };
}

describe("accessibility source guard", () => {
  const { images, unnamedButtons } = audit();

  it("gives every image an alt, empty when it is decoration", () => {
    expect(images).toEqual([]);
  });

  it("names every icon-only button", () => {
    expect(unnamedButtons).toEqual([]);
  });
});
