import { describe, expect, it } from "bun:test";

import { newIdScope, scopeSvgIds } from "./scope-ids";

const CARD =
  '<div role="img" aria-labelledby="mc-1-title mc-1-missing"><svg>' +
  '<defs><linearGradient id="mc-1-g"><stop offset="0"/></linearGradient>' +
  '<clipPath id="mc-1-clip"><rect width="10"/></clipPath><path id="mc-1-p" d="M0 0"/></defs>' +
  '<title id="mc-1-title">Carte</title>' +
  '<rect fill="url(#mc-1-g)" clip-path="url( #mc-1-clip )" style="fill:url(\'#mc-1-g\')"/>' +
  '<use href="#mc-1-p"/><use xlink:href="#mc-1-p"/><use href="#elsewhere"/>' +
  '<g data-mc-id="keep" data-id="keep2"/></svg></div>';

const ids = (html: string) => [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]!);
const references = (html: string) => [
  ...[...html.matchAll(/url\(\s*['"]?#([^)'"\s]+)/g)].map((match) => match[1]!),
  ...[...html.matchAll(/href="#([^"]+)"/g)].map((match) => match[1]!),
];

describe("scopeSvgIds", () => {
  it("suffixes every id and every reference to one with the scope", () => {
    const out = scopeSvgIds(CARD, "m7");
    expect(ids(out)).toEqual(["mc-1-g-m7", "mc-1-clip-m7", "mc-1-p-m7", "mc-1-title-m7"]);
    expect(out).toContain('fill="url(#mc-1-g-m7)"');
    expect(out).toContain('clip-path="url(#mc-1-clip-m7)"');
    expect(out).toContain("style=\"fill:url('#mc-1-g-m7')\"");
    expect(out).toContain('<use href="#mc-1-p-m7"/>');
    expect(out).toContain('<use xlink:href="#mc-1-p-m7"/>');
    expect(out).toContain('aria-labelledby="mc-1-title-m7 mc-1-missing"');
  });

  it("leaves a reference to an id the markup does not define, and attributes that merely end in id", () => {
    const out = scopeSvgIds(CARD, "m7");
    expect(out).toContain('<use href="#elsewhere"/>');
    expect(out).toContain('data-mc-id="keep" data-id="keep2"');
  });

  it("leaves markup with no id exactly as it was", () => {
    const html = '<div role="img"><svg><rect fill="red"/></svg></div>';
    expect(scopeSvgIds(html, "m1")).toBe(html);
  });

  it("every reference in the result points at an id the same result defines", () => {
    const out = scopeSvgIds(CARD, "m3");
    const defined = new Set(ids(out));
    for (const reference of references(out).filter((id) => id !== "elsewhere")) {
      expect(defined.has(reference)).toBe(true);
    }
  });

  it("two identical cards on one page share no id once each has its own scope", () => {
    const a = scopeSvgIds(CARD, newIdScope());
    const b = scopeSvgIds(CARD, newIdScope());
    const all = [...ids(a), ...ids(b)];
    expect(new Set(all).size).toBe(all.length);
    // And each still resolves inside itself.
    for (const html of [a, b]) {
      const defined = new Set(ids(html));
      for (const reference of references(html).filter((id) => id !== "elsewhere")) {
        expect(defined.has(reference)).toBe(true);
      }
    }
  });

  it("is repeatable: the cache's string is never changed, and a scope is never reused", () => {
    const before = CARD.slice();
    expect(scopeSvgIds(CARD, "m1")).toBe(scopeSvgIds(CARD, "m1"));
    expect(CARD).toBe(before);
    expect(newIdScope()).not.toBe(newIdScope());
  });
});
