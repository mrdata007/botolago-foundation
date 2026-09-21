import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import ts from "typescript";

// Every caller renders match cards into a single-column `grid`
// (`<div className="grid gap-2">` on Home, on all three Matches sections and
// on the Match detail "other matches" list). A grid's implicit `auto` track is
// sized to the largest item's content-based minimum, and the club-name spans
// inside the card are `truncate`, i.e. `white-space: nowrap` -- so the card's
// minimum is the full, untruncated club name. `min-w-0` on the *inner* name
// columns only relaxes their own flex minimum; it does not stop that minimum
// propagating out into the grid track, which then grows past the page gutter.
//
// Measured in Chromium at a 390px viewport before this was pinned, with
// production-length club names ("Raja Club Athletic" v "CODM Meknès"):
//   FR /matches  card L12 -> R464 (W452) inside a 366px content box; the away
//                crest sat at L421 -> R449 and the away name was cut at R413
//   AR /matches  the same overflow mirrors to the inline-end: card L-72 ->
//                R378, with the matchday chip "ج. 14" at L-57 -> R-34
// Ten descendants per card were fully outside the viewport.
//
// Nothing caught it, because `html, body { overflow-x: clip }` in styles.css
// means an overflowing card produces no horizontal scrollbar at all:
// `document.documentElement.scrollWidth` stayed at exactly 390, so the e2e
// `expectNoHorizontalOverflow()` check passed while the content was clipped
// away and unreachable. Live cards also escaped by accident -- they carry
// `overflow-hidden` for the ambient tint, and a non-visible overflow zeroes a
// grid item's automatic minimum size -- which is why only some cards broke.
//
// The containment has to live on the card, not on one caller's container, so
// it holds at every call site. This is a source-level pin: a DOM test would
// need a browser, and `bun test` has none.

const source = readFileSync(new URL("./MatchCard.tsx", import.meta.url), "utf8");
const tree = ts.createSourceFile(
  "MatchCard.tsx",
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);

/** Every string literal inside a node, joined -- comments deliberately excluded
 * so this file's own explanation of the bug can never satisfy an assertion. */
function classLiterals(node: ts.Node): string {
  const parts: string[] = [];
  const visit = (child: ts.Node) => {
    if (ts.isStringLiteral(child) || ts.isNoSubstitutionTemplateLiteral(child)) {
      parts.push(child.text);
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
  return parts.join(" ");
}

/** The classes on the card's root router `<Link>`. */
function rootLinkClassName(): string {
  const found: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      if (node.tagName.getText() === "Link") {
        for (const attribute of node.attributes.properties) {
          if (
            ts.isJsxAttribute(attribute) &&
            attribute.name.getText() === "className" &&
            attribute.initializer
          ) {
            found.push(classLiterals(attribute.initializer));
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  expect(found).toHaveLength(1);
  return found[0]!;
}

describe("MatchCard viewport containment", () => {
  it("lets the card shrink to its container instead of widening the grid track", () => {
    const className = rootLinkClassName();
    // `min-width: 0` is inert for a block in normal flow, so it costs nothing
    // where it is not needed; as a grid/flex item it is the whole fix.
    expect(className).toMatch(/\bmin-w-0\b/);
    // Utilities that would hand the intrinsic minimum straight back.
    expect(className).not.toMatch(/\b(min-)?w-(max|fit)\b/);
  });

  it("keeps the club-name columns shrinkable and their names truncating", () => {
    // Home side and away side. Without `min-w-0` here the columns refuse to
    // shrink below their content inside a 366px card; without `truncate` the
    // name has no way to give ground at all.
    const literals = classLiterals(tree);
    expect(literals).toContain("flex min-w-0 flex-1 items-center gap-2");
    expect(literals).toContain("flex min-w-0 flex-1 items-center justify-end gap-2");
    expect(literals.match(/\btruncate\b/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it("uses logical direction utilities only, so Arabic mirrors", () => {
    // The Arabic half of the overflow is the same defect reflected to the
    // inline-start edge. A physical `left`/`right` utility anywhere in the
    // card would stop it mirroring and re-open that half.
    const physical =
      /\b(?:text-(?:left|right)|float-(?:left|right)|(?:m|p)(?:l|r)-|(?:left|right)-|border-[lr](?![a-z])|rounded-[lr](?![a-z]))/g;
    const offenders = new Set<string>();
    const visit = (node: ts.Node) => {
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        for (const hit of node.text.match(physical) ?? []) offenders.add(hit);
      }
      ts.forEachChild(node, visit);
    };
    visit(tree);
    expect([...offenders]).toEqual([]);
  });
});
