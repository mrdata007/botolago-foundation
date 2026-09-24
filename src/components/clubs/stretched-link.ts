/**
 * A link whose `::after` covers its nearest positioned ancestor — a table
 * row, a card — so the whole row is the target while the link is named by
 * its own text alone (a club's name), and the figures beside it are still
 * read as figures rather than folded into the link's name. The focus ring is
 * drawn on the `::after`, round the whole row.
 *
 * The ancestor must be `relative`. Anything else in the row that must stay
 * pressable on its own needs to sit above the overlay (`relative z-10`).
 */
export const STRETCHED_LINK =
  "after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-[color:var(--ui-ink-fg)]";
