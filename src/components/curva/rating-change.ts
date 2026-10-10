import type { HistoryRowDto } from "@/backend/manager-card/contracts";

/**
 * The rating change chip beside the rating line (« +3 ▲ », « −2 ▼ »): how the number moved at the
 * latest round. The browser never computes a rating; it only subtracts two numbers the server
 * stored, the card's current one (the newest stored journée) and the one before it.
 */
export interface RatingChange {
  /** Signed, never 0. */
  delta: number;
  /** The journée the change belongs to (`season:journée`): a new one is a new round. */
  round: string;
}

/**
 * The change at the newest stored journée, or null: no history yet, a newest row that is not the
 * number the card shows (the history lags the card, or the card is last season's number in a new
 * season), no earlier number to compare with (the first rating), or no change.
 */
export function ratingChange(input: {
  rows: readonly HistoryRowDto[];
  /** The number the card shows (`CardView.ovr`). */
  ovr: number | null;
  /** The card shows last season's number: nothing moved. */
  newSeason: boolean;
  seasonId: string;
}): RatingChange | null {
  if (input.ovr === null || input.newSeason) return null;
  const rows = input.rows
    .filter((row) => row.seasonId === input.seasonId)
    .sort((a, b) => b.gameweekSeq - a.gameweekSeq);
  const latest = rows[0];
  if (!latest || latest.ovr === null || latest.ovr !== input.ovr) return null;
  const before = rows.slice(1).find((row) => row.ovr !== null);
  if (!before || before.ovr === null) return null;
  const delta = latest.ovr - before.ovr;
  if (delta === 0) return null;
  return { delta, round: `${input.seasonId}:${latest.gameweekSeq}` };
}

/** The unicode minus sign (U+2212), not a hyphen: a minus is as wide as a plus. */
export const MINUS = "−";

/** « +3 » or « −2 »: the signed figure the chip prints. */
export function signedDelta(delta: number): string {
  return delta > 0 ? `+${delta}` : `${MINUS}${Math.abs(delta)}`;
}

/** The chip's arrow: up for a rise, down for a fall (a shape as well as a colour). */
export function deltaArrow(delta: number): "▲" | "▼" {
  return delta > 0 ? "▲" : "▼";
}

export interface RoundMemory {
  read(): string | null;
  /** Whether the value was kept. */
  write(value: string): boolean;
}

/**
 * The round whose chip popped on this phone (`season:journée`). Read and written inside try/catch
 * like every key of `storage.ts` (which pins its own list of keys, so this one lives here).
 */
export const RATING_BADGE_KEY = "botolago.card.rating_badge.v1";

export const deviceRoundMemory: RoundMemory = {
  read: () => {
    try {
      return window.localStorage.getItem(RATING_BADGE_KEY);
    } catch {
      return null;
    }
  },
  write: (value) => {
    try {
      window.localStorage.setItem(RATING_BADGE_KEY, value);
      return true;
    } catch {
      return false;
    }
  },
};

/**
 * Whether the chip pops now: once per new round on this phone. The round is written down before
 * the pop starts, and a phone that cannot remember (blocked storage) shows the chip without the
 * pop, so it is never replayed on every visit.
 */
export function shouldPop(round: string, memory: RoundMemory = deviceRoundMemory): boolean {
  if (memory.read() === round) return false;
  return memory.write(round);
}
