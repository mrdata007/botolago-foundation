import { describe, expect, test } from "bun:test";

import { parseSofascoreLineups } from "./sofascore-performance-parse.ts";

// Full coverage (owner, 2026-10-12): every player with minutesPlayed > 0 has both
// `rating` and `totalPass`. Anything else is limited.

type Stats = {
  minutesPlayed?: number;
  rating?: number;
  totalPass?: number;
  goalAssist?: number;
  saves?: number;
};
const entry = (id: number, statistics?: Stats, substitute = false) => ({
  player: { id, name: `Player ${id}` },
  shirtNumber: id,
  position: "M",
  substitute,
  ...(statistics ? { statistics } : {}),
});
const lineups = (home: ReturnType<typeof entry>[], away: ReturnType<typeof entry>[] = []) =>
  parseSofascoreLineups({ home: { players: home }, away: { players: away } });

const full: Stats = { minutesPlayed: 90, rating: 6.8, totalPass: 31, goalAssist: 1, saves: 0 };

describe("SofaScore full coverage", () => {
  test("every player who played has a rating and a pass count: full", () => {
    const result = lineups([entry(1, full), entry(2, full), entry(3, undefined, true)]);
    expect(result.fullCoverage).toBe(true);
    // Rich fields are known on a full match.
    expect(result.players[0].stats?.assists).toBe(1);
    expect(result.players[0].stats?.saves).toBe(0);
  });

  test("a player who played without a rating makes it limited", () => {
    const result = lineups([
      entry(1, full),
      entry(2, { ...full, rating: undefined, minutesPlayed: 2 }),
    ]);
    expect(result.fullCoverage).toBe(false);
    // Unknown, never zero.
    expect(result.players[0].stats?.assists).toBeNull();
    expect(result.players[0].stats?.saves).toBeNull();
  });

  test("a player who played without a pass count makes it limited", () => {
    expect(
      lineups([entry(1, full), entry(2, { ...full, totalPass: undefined })]).fullCoverage,
    ).toBe(false);
  });

  test("one player with totalPass is no longer enough (the previous rule)", () => {
    const core: Stats = { minutesPlayed: 90 };
    expect(lineups([entry(1, { ...core, totalPass: 20 }), entry(2, core)]).fullCoverage).toBe(
      false,
    );
  });

  test("a bench player who did not play is ignored, played or not in the data", () => {
    expect(
      lineups([entry(1, full), entry(2, { minutesPlayed: 0 }, true), entry(3, undefined, true)])
        .fullCoverage,
    ).toBe(true);
  });

  test("nobody on the pitch is not full", () => {
    expect(lineups([entry(1, { minutesPlayed: 0 }), entry(2)]).fullCoverage).toBe(false);
    expect(lineups([]).fullCoverage).toBe(false);
  });

  test("core data only (minutes, goals) is limited", () => {
    const result = lineups([entry(1, { minutesPlayed: 90 }), entry(2, { minutesPlayed: 90 })]);
    expect(result.fullCoverage).toBe(false);
    expect(result.players.every((p) => p.stats?.assists === null)).toBe(true);
  });

  test("both sides count", () => {
    expect(lineups([entry(1, full)], [entry(2, full)]).fullCoverage).toBe(true);
    expect(lineups([entry(1, full)], [entry(2, { ...full, rating: undefined })]).fullCoverage).toBe(
      false,
    );
  });
});
