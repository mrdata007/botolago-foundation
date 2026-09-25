import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// `articleLeadPlacement` (components/news/article-lead.ts) decides where an
// article's lead is shown, and its tests cover that decision. The page has to
// act on it: draw the deck only for "deck", and give the body's first
// paragraph the lead's weight only for "body". A page that drew the deck
// unconditionally again would show the lead twice and still pass every test
// of the function, so the wiring is held here.

const READER = join(import.meta.dir, "news.$articleId.tsx");
// Comments are stripped first: they describe the wiring in prose.
const page = readFileSync(READER, "utf8")
  .replace(/\{?\/\*[\s\S]*?\*\/\}?/g, "")
  .replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("the article page shows its lead once", () => {
  it("places the lead from the deck it draws and the body it injects", () => {
    expect(page).toContain("const deck = article.subtitle ?? article.summary;");
    expect(page).toContain("articleLeadPlacement(deck, article.bodyHtml)");
    expect(page).toContain("dangerouslySetInnerHTML={{ __html: article.bodyHtml }}");
  });

  it("draws the deck only when the placement is 'deck', and nowhere else", () => {
    expect(page).toMatch(/\{leadPlacement === "deck" && \(\s*<p\b[^>]*>\{deck\}<\/p>\s*\)\}/);
    expect(page.match(/\{deck\}/g)).toHaveLength(1);
  });

  it("gives the body's first paragraph the lead's weight only when the placement is 'body'", () => {
    const start = page.indexOf('"editorial-body');
    expect(start).toBeGreaterThan(-1);
    const wrapper = page.slice(start, page.indexOf("dangerouslySetInnerHTML", start));
    expect(wrapper).toContain('leadPlacement === "body" && LEAD_IN_BODY_CLASS');
    expect(page.match(/LEAD_IN_BODY_CLASS/g)).toHaveLength(2); // the import and the wrapper
  });
});
