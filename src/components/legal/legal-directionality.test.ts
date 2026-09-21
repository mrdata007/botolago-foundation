import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";

/**
 * Both legal documents exist in Arabic, and half the app reads them that way.
 * Two classes of utility break that silently — silently because the French
 * page keeps looking perfect:
 *
 *   - a physical direction (`ml-`, `pr-`, `text-left`, `border-l`, `left-`…)
 *     pins a margin, a bullet indent or a table edge to one side of the
 *     screen, so the RTL layout mirrors around it and the page comes apart.
 *   - any `tracking-*` letter-spacing applied to Arabic breaks the joins
 *     between letters. Arabic letterforms connect; spacing them — in either
 *     direction, positive or negative — renders the word as disconnected
 *     glyphs. There is no "small enough" amount, so the rule is none at all.
 *
 * Scanned across every file in this folder, so a new legal component is
 * covered the day it is added rather than the day someone remembers to extend
 * a list. String literals only: this comment's own examples must never satisfy
 * or trip an assertion.
 */

const HERE = fileURLToPath(new URL(".", import.meta.url));

const SOURCES = readdirSync(HERE)
  .filter((name) => /\.tsx?$/.test(name) && !name.includes(".test."))
  .sort();

function stringLiterals(file: string): string[] {
  const source = readFileSync(HERE + file, "utf8");
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out: string[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      out.push(node.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return out;
}

it("has legal components to scan", () => {
  // Guards the guard: an empty directory listing would make every assertion
  // below vacuously true.
  expect(SOURCES.length).toBeGreaterThan(0);
  expect(SOURCES).toContain("LegalDocumentView.tsx");
});

describe.each(SOURCES)("%s", (file) => {
  const literals = stringLiterals(file);

  it("uses logical direction utilities only, so Arabic mirrors", () => {
    const physical =
      /\b(?:text-(?:left|right)|float-(?:left|right)|(?:m|p)(?:l|r)-|(?:left|right)-|border-[lr](?![a-z])|rounded-[lr](?![a-z]))/g;
    const offenders = new Set<string>();
    for (const literal of literals) {
      for (const hit of literal.match(physical) ?? []) offenders.add(hit);
    }
    expect([...offenders]).toEqual([]);
  });

  it("applies no letter-spacing to text that can be Arabic", () => {
    const offenders = new Set<string>();
    for (const literal of literals) {
      for (const hit of literal.match(/\btracking-[a-z[-]\S*/g) ?? []) offenders.add(hit);
    }
    expect([...offenders]).toEqual([]);
  });

  it("never hand-mirrors or hand-splits a translated string", () => {
    // Reversing, slicing or index-hunting inside translated text is how a
    // sentence gets broken in the language nobody on the team reads back.
    const source = readFileSync(HERE + file, "utf8");
    expect(source).not.toMatch(/\.reverse\(\)/);
    expect(source).not.toMatch(/\.split\(["'`]["'`]\)/);
    expect(source).not.toMatch(/\bindexOf\(|\.slice\(/);
  });
});
