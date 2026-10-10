/**
 * Ids for SVG defs. A page can hold dozens of cards; every render draws its own gradients, patterns,
 * masks and clip paths under `mc-<n>-<key>`, so no two cards drawn in one go share an id (and
 * `../scope-ids.ts` makes the cached markup unique per mounted card).
 */
let counter = 0;

/** A fresh prefix for one render. */
export function uid(prefix = "mc"): string {
  counter += 1;
  return `${prefix}-${counter}`;
}
