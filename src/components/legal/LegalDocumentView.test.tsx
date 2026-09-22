import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { LEGAL_DOCUMENTS, type LegalBlock, type LegalDocument } from "@/content/legal/documents";
import { LegalDocumentView } from "./LegalDocumentView";

/**
 * `LegalDocumentView` is a pure function of its props — no i18n context, no
 * router — precisely so it can be rendered for real here. `bun test` has no
 * DOM, but `react-dom/server` needs none, so these are assertions about the
 * markup a reader actually receives rather than about the source text.
 *
 * What is worth pinning is that no block type is silently dropped. A `switch`
 * that quietly returns nothing for `table` would still typecheck, still render
 * the rest of the Privacy Policy, and lose the four tables that carry the
 * actual data-handling commitments — the part a reader most needs.
 */

const DOCS: Array<[string, LegalDocument]> = [
  ["terms.fr", LEGAL_DOCUMENTS.terms.fr],
  ["terms.ar", LEGAL_DOCUMENTS.terms.ar],
  ["privacy.fr", LEGAL_DOCUMENTS.privacy.fr],
  ["privacy.ar", LEGAL_DOCUMENTS.privacy.ar],
];

const HINT = "scroll-hint";

function render(doc: LegalDocument): string {
  return renderToStaticMarkup(<LegalDocumentView doc={doc} tableScrollHint={HINT} />);
}

function count(html: string, tag: string): number {
  return html.match(new RegExp(`<${tag}(?:\\s|>)`, "g"))?.length ?? 0;
}

function blocksOfType<T extends LegalBlock["type"]>(
  doc: LegalDocument,
  type: T,
): Array<Extract<LegalBlock, { type: T }>> {
  return doc.blocks.filter((b): b is Extract<LegalBlock, { type: T }> => b.type === type);
}

/** How React escapes text into HTML, so expected strings can be compared. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

describe.each(DOCS)("%s", (_name, doc) => {
  const html = render(doc);

  it("renders the document title as the one and only h1", () => {
    expect(count(html, "h1")).toBe(1);
    expect(html).toContain(escapeHtml(doc.title));
  });

  it("renders every heading as an h2 under that h1", () => {
    const headings = blocksOfType(doc, "heading");
    expect(headings.length).toBeGreaterThan(0);
    expect(count(html, "h2")).toBe(headings.length);
    // No deeper level exists in the source, so none should be invented.
    expect(count(html, "h3")).toBe(0);
  });

  it("renders every paragraph", () => {
    expect(count(html, "p")).toBe(blocksOfType(doc, "paragraph").length);
  });

  it("renders every list as a <ul> with one <li> per item", () => {
    const lists = blocksOfType(doc, "list");
    expect(count(html, "ul")).toBe(lists.length);
    expect(count(html, "li")).toBe(lists.reduce((n, list) => n + list.items.length, 0));
  });

  it("renders every table as a real <table>, never a stack of divs", () => {
    const tables = blocksOfType(doc, "table");
    expect(count(html, "table")).toBe(tables.length);
    expect(count(html, "thead")).toBe(tables.length);
    expect(count(html, "tbody")).toBe(tables.length);
  });

  it("gives every table header cell a column scope", () => {
    const tables = blocksOfType(doc, "table");
    const headerCells = tables.reduce((n, table) => n + table.head.length, 0);
    expect(count(html, "th")).toBe(headerCells);
    // Every <th> rendered is a scoped column header: an unscoped header in a
    // multi-column table leaves a screen reader guessing which column a cell
    // belongs to.
    expect(html.match(/<th scope="col"/g)?.length ?? 0).toBe(headerCells);
  });

  it("renders every body cell of every table", () => {
    const tables = blocksOfType(doc, "table");
    const bodyCells = tables.reduce(
      (n, table) => n + table.rows.reduce((m, row) => m + row.length, 0),
      0,
    );
    expect(count(html, "td")).toBe(bodyCells);
  });

  it("loses no text from any block", () => {
    // The strongest statement available without a browser: every string the
    // owner supplied reaches the markup, whatever its block type.
    for (const block of doc.blocks) {
      const texts =
        block.type === "heading" || block.type === "paragraph"
          ? [block.text]
          : block.type === "list"
            ? block.items
            : [...block.head, ...block.rows.flat()];
      for (const text of texts) expect(html).toContain(escapeHtml(text));
    }
  });
});

describe("the four Privacy Policy tables", () => {
  it("are present in both languages", () => {
    for (const lang of ["fr", "ar"] as const) {
      const doc = LEGAL_DOCUMENTS.privacy[lang];
      expect(blocksOfType(doc, "table")).toHaveLength(4);
      expect(count(render(doc), "table")).toBe(4);
    }
  });

  it("each sit in their own labelled, keyboard-reachable scroll container", () => {
    // 390px is the primary viewport. A three-column table of full sentences
    // cannot be read there, so the container scrolls rather than the page —
    // and a container that scrolls must be reachable without a pointer, and
    // must say what it is when focus lands on it.
    const html = render(LEGAL_DOCUMENTS.privacy.fr);
    const containers = html.match(/<div role="group"[^>]*>/g) ?? [];
    expect(containers).toHaveLength(4);
    for (const container of containers) {
      expect(container).toContain(`aria-label="${HINT}"`);
      expect(container).toContain('tabindex="0"');
      expect(container).toContain("overflow-x-auto");
      // The container must not be able to widen the page itself.
      expect(container).toContain("max-w-full");
    }
  });

  it("keeps the wide tables usable instead of crushing them into the gutter", () => {
    // Three-column tables get a minimum width and let the container scroll;
    // two-column tables simply fill it. Both documents' tables are checked by
    // shape rather than by index so re-ordering the source cannot fool this.
    const doc = LEGAL_DOCUMENTS.privacy.fr;
    const html = render(doc);
    const tags = html.match(/<table class="[^"]*"/g) ?? [];
    const widths = blocksOfType(doc, "table").map((t) => t.head.length);
    expect(tags).toHaveLength(widths.length);
    tags.forEach((tag, index) => {
      expect(tag).toContain(widths[index]! >= 3 ? "min-w-[32rem]" : "min-w-full");
    });
  });
});

describe("the article itself", () => {
  it("can shrink to its container, so a wide table cannot widen the page", () => {
    // Without `min-w-0` the article's intrinsic minimum — set by its widest
    // descendant — propagates out to the page and overflows the 390px gutter.
    const html = render(LEGAL_DOCUMENTS.privacy.fr);
    expect(html.slice(0, html.indexOf(">") + 1)).toContain("min-w-0");
  });
});
