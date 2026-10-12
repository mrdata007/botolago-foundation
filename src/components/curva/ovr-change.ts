import type { MyCardDto } from "@/backend/manager-card/contracts";

/**
 * The rating change the card animates once (« 58 → 62 », brief
 * `docs/engineering/briefs/MANAGER_CARD_OVR_CHANGE_BRIEF.md`). The server says what moved and
 * remembers that it was seen (`card.ovrChanges`, acknowledged by its key); the browser only counts
 * from one stored number to the other.
 */
export interface OvrChange {
  key: string;
  from: number;
  to: number;
  /** Signed, never 0. */
  delta: number;
}

/**
 * The change to play, or null: none served (an older server, or already seen), a change whose new
 * number is not the number the card shows (the card moved again since, or shows last season's
 * number in a new season), or one that does not move.
 */
export function pendingOvrChange(card: MyCardDto, shownOvr: number | null): OvrChange | null {
  const change = card.ovrChanges?.[0];
  if (!change || shownOvr === null || card.ovr === null) return null;
  if (change.toOvr !== shownOvr || change.toOvr !== card.ovr) return null;
  const delta = change.toOvr - change.fromOvr;
  if (delta === 0) return null;
  return { key: change.key, from: change.fromOvr, to: change.toOvr, delta };
}

/** How long the number counts: a little longer for a bigger move, never past 1.4 s. */
export function countMs(delta: number): number {
  return Math.min(1400, 700 + 60 * Math.abs(delta));
}

/** When the count starts: after the card's entrance has landed (the chip's pop waits as long). */
export const COUNT_DELAY_MS = 620;

/** How long the glow stays after the number lands, before it fades. */
export const GLOW_HOLD_MS = 500;

/** The ease of the count: fast out of the old number, settling on the new one. */
export const COUNT_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

/** The whole number shown for a value between `from` and `to` (never past either). */
export function countValue(from: number, to: number, value: number): number {
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  return Math.min(hi, Math.max(lo, Math.round(value)));
}
