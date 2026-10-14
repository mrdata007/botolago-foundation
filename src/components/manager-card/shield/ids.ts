/**
 * Ids for SVG defs: every drawing names its gradients `mc-<n>-…` (`mc-t-<n>-…` for a token), so no
 * two drawings made in one go share an id; `../scope-ids.ts` makes the cached markup unique per
 * mounted card.
 */
let counter = 0;

/** A fresh prefix for one drawing. */
export function uid(prefix = "mc"): string {
  counter += 1;
  return `${prefix}-${counter}`;
}
