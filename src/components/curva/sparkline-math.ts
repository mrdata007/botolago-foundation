import type { HistoryRowDto } from "@/backend/manager-card/contracts";

/** The geometry of the season's line: pure, so it is tested without a browser. */
export const HEIGHT = 64;
const PAD_X = 10;
const PAD_Y = 10;

interface Point {
  x: number;
  y: number;
  provisional: boolean;
  latest: boolean;
}

export function sparklinePoints(
  rows: readonly HistoryRowDto[],
  width: number,
  rtl: boolean,
): { segments: Point[][]; points: Point[] } {
  // Oldest first.
  const ordered = [...rows].sort((a, b) => a.gameweekSeq - b.gameweekSeq);
  const values = ordered.map((row) => row.ovr).filter((v): v is number => v !== null);
  if (ordered.length === 0 || values.length === 0) return { segments: [], points: [] };
  const lo = Math.min(...values) - 3;
  const hi = Math.max(...values) + 3;
  const span = Math.max(hi - lo, 8);
  const inner = Math.max(width - 2 * PAD_X, 1);
  const lastIndex = ordered.length - 1;
  let latestSeq = -1;
  for (const row of ordered) if (row.ovr !== null) latestSeq = row.gameweekSeq;

  const segments: Point[][] = [];
  const points: Point[] = [];
  let current: Point[] = [];
  ordered.forEach((row, index) => {
    if (row.ovr === null) {
      if (current.length > 0) segments.push(current);
      current = [];
      return;
    }
    const t = lastIndex === 0 ? 0.5 : index / lastIndex;
    const x = PAD_X + (rtl ? 1 - t : t) * inner;
    const y = PAD_Y + (1 - (row.ovr - lo) / span) * (HEIGHT - 2 * PAD_Y);
    const point: Point = {
      x: Math.round(x * 10) / 10,
      y: Math.round(y * 10) / 10,
      provisional: row.provisional,
      latest: row.gameweekSeq === latestSeq,
    };
    current.push(point);
    points.push(point);
  });
  if (current.length > 0) segments.push(current);
  return { segments, points };
}
