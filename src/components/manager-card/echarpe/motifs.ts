/**
 * The scarf's smaller motifs: the number (or its dash), the tier word, and the marks that show how
 * many journées are counted while the rating is still forming.
 */
import { AR_TIER, D913, T4 } from "./charts";
import { trimRows, word } from "./knit";
import type { TierCode } from "../types";

/** The dash of a card with no rating yet: a long dash, never 0 and never blank. */
export const DASH = "—";

/** The knitted tier words are fixed art, charted in capitals. */
export const TIER_WORD: Readonly<Record<TierCode, string>> = {
  homa: "HOMA",
  stade: "STADE",
  pro: "PRO",
  champion: "CHAMPION",
  legend: "LEGEND",
};

/**
 * The knitted dash: 14 stitches by 3 rows (the stem weight of the 84's figures) at mid-height of the
 * 13-row band, in the 84's own yarn.
 */
export const DASH13: readonly string[] = Array.from({ length: 13 }, (_, r) =>
  (r >= 5 && r <= 7 ? "#" : ".").repeat(14),
);

/** The 84: two 9 by 13 figures, two stitches apart; or, with no rating yet, the dash. */
export const digitsArt = (ovr: number | null): readonly string[] =>
  ovr == null ? DASH13 : word(String(ovr), D913, 2);

/** The tier word: Latin on 4 rows; Arabic hand-charted. The interface language chooses. */
export const tierArt = (tier: TierCode, ar: boolean): string[] =>
  ar ? trimRows(AR_TIER[tier]) : word(TIER_WORD[tier], T4, 1);
