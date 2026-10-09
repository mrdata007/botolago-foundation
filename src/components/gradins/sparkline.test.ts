import { describe, expect, it } from "bun:test";

import type { HistoryRowDto } from "@/backend/manager-card/contracts";
import { FIXTURES } from "@/backend/manager-card/fixtures";

import { sparklinePoints } from "./sparkline-math";

const rows = FIXTURES.returning.history;

describe("the season's line", () => {
  it("draws oldest to newest along the reading direction, mirrored in Arabic", () => {
    const fr = sparklinePoints(rows, 300, false).points;
    const ar = sparklinePoints(rows, 300, true).points;
    expect(fr[0]!.x).toBeLessThan(fr.at(-1)!.x);
    expect(ar[0]!.x).toBeGreaterThan(ar.at(-1)!.x);
    expect(fr[0]!.x + ar[0]!.x).toBeCloseTo(300, 0);
  });

  it("leaves a gap where the card had no note, never a zero", () => {
    const withGap: HistoryRowDto[] = [
      { ...rows[0]!, gameweekSeq: 3, ovr: 80, provisional: true },
      { ...rows[0]!, gameweekSeq: 4, ovr: null, provisional: false },
      { ...rows[0]!, gameweekSeq: 5, ovr: 82, provisional: true },
    ];
    const { segments, points } = sparklinePoints(withGap, 300, false);
    expect(segments).toHaveLength(2);
    expect(points).toHaveLength(2);
  });

  it("marks provisional points and the latest one", () => {
    const { points } = sparklinePoints(rows, 300, false);
    expect(points.filter((p) => p.provisional).length).toBeGreaterThan(0);
    expect(points.filter((p) => p.latest)).toHaveLength(1);
    expect(points.at(-1)!.latest).toBe(true);
  });

  it("puts a higher note higher on the page and stays inside its 64px", () => {
    const { points } = sparklinePoints(rows, 300, false);
    const best = points.reduce((a, b) => (a.y < b.y ? a : b));
    const worst = points.reduce((a, b) => (a.y > b.y ? a : b));
    expect(best.y).toBeLessThan(worst.y);
    for (const p of points) {
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(64);
    }
  });

  it("draws nothing for a season with no note yet", () => {
    expect(sparklinePoints(FIXTURES.forming1.history, 300, false)).toEqual({
      segments: [],
      points: [],
    });
    expect(sparklinePoints([], 300, false).points).toEqual([]);
  });
});
