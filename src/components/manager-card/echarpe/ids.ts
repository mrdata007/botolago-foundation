/**
 * Ids for SVG defs. A page can hold dozens of cards; every render draws its own gradients, patterns
 * and clip paths under `mc-<n>-<key>`, so no two cards on a page share an id.
 */
let counter = 0;

/** A fresh prefix for one render. */
export function uid(prefix = "mc"): string {
  counter += 1;
  return `${prefix}-${counter}`;
}
