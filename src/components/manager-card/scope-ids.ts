/**
 * Making a card's SVG ids unique on the page (plan section 6.5). The renderer numbers its ids
 * itself (`mc-<n>-…`), but the markup of a card is cached and shared: two identical cards on one
 * page would carry the same ids, and a gradient or clip path referenced by `url(#…)` would
 * resolve to the first card's, or to nothing once that card is hidden. Each mounted card (or
 * token) therefore gets a scope of its own, and every id it holds and every reference to one is
 * suffixed with it as the markup is inserted. The cache keeps the plain string.
 *
 * Rewritten: `id="…"`, `url(#…)` (attributes and inline styles), `href="#…"` and
 * `xlink:href="#…"`, and the id lists of `aria-labelledby` / `aria-describedby`. A reference to an
 * id the markup does not define is left as it is.
 */
let nextScope = 0;

/** A scope for one mounted card; each call returns a new one. */
export function newIdScope(): string {
  nextScope += 1;
  return `m${nextScope}`;
}

export function scopeSvgIds(html: string, scope: string): string {
  const ids = new Set<string>();
  for (const match of html.matchAll(/\sid="([^"]+)"/g)) ids.add(match[1]!);
  if (ids.size === 0) return html;
  const scoped = (id: string) => `${id}-${scope}`;
  return html
    .replace(
      /(\s)id="([^"]+)"/g,
      (_whole, space: string, id: string) => `${space}id="${scoped(id)}"`,
    )
    .replace(/url\(\s*(['"]?)#([^)'"\s]+)\1\s*\)/g, (whole, quote: string, id: string) =>
      ids.has(id) ? `url(${quote}#${scoped(id)}${quote})` : whole,
    )
    .replace(/(\s(?:xlink:)?href\s*=\s*")#([^"]+)"/g, (whole, head: string, id: string) =>
      ids.has(id) ? `${head}#${scoped(id)}"` : whole,
    )
    .replace(
      /(\saria-(?:labelledby|describedby)\s*=\s*")([^"]*)"/g,
      (_whole, head: string, list: string) =>
        `${head}${list
          .split(/\s+/)
          .filter(Boolean)
          .map((id) => (ids.has(id) ? scoped(id) : id))
          .join(" ")}"`,
    );
}
