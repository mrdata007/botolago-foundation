/**
 * What time a league's standings can honestly be dated with.
 *
 * The league screen used to print the clock at render time as "Dernière mise
 * à jour", so an unrelated re-render moved it and old standings looked fresh
 * (audit 2026-10-14, UX-010). A time now has to belong to the data:
 *
 * - `calculated`: when the ranking service last calculated a row (the API's
 *   `calculatedAt`); the latest of the rows;
 * - `retrieved`: when this page last read the standings successfully (React
 *   Query's `dataUpdatedAt`) -- said as retrieval, since it only says when we
 *   asked, not when the ranking was made;
 * - `null`: neither is known; the screen says nothing rather than guess.
 */
export type LeagueFreshness =
  | { readonly kind: "calculated"; readonly at: number }
  | { readonly kind: "retrieved"; readonly at: number };

export function leagueFreshness(
  standings: readonly { readonly calculatedAt?: string }[],
  retrievedAt: number,
): LeagueFreshness | null {
  let calculated: number | null = null;
  for (const row of standings) {
    const time = row.calculatedAt === undefined ? NaN : Date.parse(row.calculatedAt);
    if (Number.isFinite(time) && (calculated === null || time > calculated)) calculated = time;
  }
  if (calculated !== null) return { kind: "calculated", at: calculated };
  if (retrievedAt > 0) return { kind: "retrieved", at: retrievedAt };
  return null;
}
