import type { LegalBlock, LegalDocument } from "@/content/legal/documents";

/**
 * Renders a `LegalDocument` from `src/content/legal/documents.ts`.
 *
 * The strings are binding legal prose transcribed from the owner's source and
 * are treated here as immutable data: this component chooses elements and
 * spacing, never words. Nothing is sliced, joined, re-ordered or interpolated,
 * so an Arabic reader and a French reader see the same document with the same
 * section numbering.
 *
 * Deliberately free of `useI18n()` and of router `Link`s so it is a pure
 * function of its props — `LegalDocumentView.test.tsx` renders it with
 * `react-dom/server` under `bun test`, which has no DOM and no router.
 *
 * DIRECTION. Every utility here is logical (`ps-`/`pe-`, `text-start`,
 * `border-s`/`border-e`, `start-`/`end-`). The caller sets `dir` on an
 * ancestor; this subtree then mirrors on its own. No `tracking-*` utility
 * appears anywhere in the file: Arabic letterforms join, and letter-spacing
 * breaks the joins in either direction. Both rules are pinned by a test.
 */
export function LegalDocumentView({
  doc,
  tableScrollHint,
}: {
  doc: LegalDocument;
  /** Accessible name for each table's scroll container, in the reader's language. */
  tableScrollHint: string;
}) {
  return (
    // `min-w-0` lets the article shrink to its container rather than being
    // sized by its widest descendant. Without it a table's intrinsic minimum
    // would propagate out and widen the page past the gutter at 390px.
    <article className="min-w-0 pb-6 text-start">
      <h1 className="text-balance text-2xl font-black leading-tight text-foreground">
        {doc.title}
      </h1>
      {doc.blocks.map((block, index) => (
        <Block key={index} block={block} tableScrollHint={tableScrollHint} />
      ))}
    </article>
  );
}

function Block({ block, tableScrollHint }: { block: LegalBlock; tableScrollHint: string }) {
  switch (block.type) {
    case "heading":
      // Every heading in both documents is a top-level numbered section
      // ("1. …" … "16. …"); the source has no sub-headings, so a single <h2>
      // level under the document's <h1> is the whole outline.
      return (
        <h2 className="mt-7 text-base font-bold leading-snug text-foreground">{block.text}</h2>
      );

    case "paragraph":
      return <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{block.text}</p>;

    case "list":
      return (
        <ul className="mt-3 list-disc space-y-2 ps-5 text-sm leading-relaxed text-muted-foreground">
          {block.items.map((item, index) => (
            <li key={index} className="ps-1">
              {item}
            </li>
          ))}
        </ul>
      );

    case "table":
      return <Table head={block.head} rows={block.rows} scrollHint={tableScrollHint} />;
  }
}

/**
 * A real table, kept inside its own scroll container.
 *
 * 390px is the primary viewport and the Privacy Policy's four tables are two
 * and three columns of full sentences. Three columns squeezed into the ~366px
 * content box wrap to unreadable slivers, so the table keeps a usable minimum
 * width and the container — not the page — takes the overflow. The container
 * is a plain block in normal flow, so it cannot widen the page: there is no
 * horizontal *page* scroll, and nothing is clipped, because everything stays
 * reachable by scrolling inside the container.
 *
 * The container is focusable (`tabIndex={0}`) so a keyboard user can scroll it
 * without a pointer, and carries `role="group"` with a translated accessible
 * name, which is what makes that focus stop meaningful to a screen reader.
 */
function Table({
  head,
  rows,
  scrollHint,
}: {
  head: readonly string[];
  rows: readonly (readonly string[])[];
  scrollHint: string;
}) {
  // Two columns fit the phone content box; three do not. `min-w-full` lets a
  // narrow table simply fill the container with no scroll at all.
  const minWidth = head.length >= 3 ? "min-w-[32rem]" : "min-w-full";
  return (
    <div
      role="group"
      aria-label={scrollHint}
      tabIndex={0}
      className="mt-4 max-w-full overflow-x-auto rounded-xl border border-[var(--border-subtle,rgba(0,0,0,0.06))] bg-[color:var(--surface,#fff)]/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)]/40"
    >
      <table className={`${minWidth} border-collapse text-start text-xs`}>
        <thead>
          <tr className="bg-muted/60">
            {head.map((cell, index) => (
              <th
                key={index}
                scope="col"
                className="border-b border-[var(--border-subtle,rgba(0,0,0,0.06))] px-3 py-2 text-start align-top font-bold text-foreground"
              >
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr
              key={rowIndex}
              className="border-b border-[var(--border-subtle,rgba(0,0,0,0.06))] last:border-b-0"
            >
              {row.map((cell, cellIndex) => (
                <td
                  key={cellIndex}
                  className="px-3 py-2 text-start align-top leading-relaxed text-muted-foreground"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
