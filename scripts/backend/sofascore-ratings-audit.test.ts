import { describe, expect, test } from "bun:test";
import { auditLineups, FIXTURES_SQL } from "./sofascore-ratings-audit";
import type { PerformanceLineups } from "../../src/backend/football/provider/performance-contracts";
const fixture = (): PerformanceLineups => ({
  provider: "sofascore",
  fullCoverage: false,
  players: Array.from({ length: 22 }, (_, i) => ({
    provider: "sofascore",
    externalId: String(i + 1),
    name: "",
    side: i < 11 ? "home" : "away",
    starter: true,
    position: "M",
    shirtNumber: i + 1,
    stats: {
      minutesPlayed: 90,
      rating: 6.5,
      goals: null,
      assists: null,
      ownGoals: null,
      saves: null,
      penaltyMissed: null,
    },
  })),
});
describe("API ratings audit", () => {
  test("audits sealed weeks without privileged functions or player mapping", () => {
    expect(FIXTURES_SQL).not.toContain("fantasy_adaptive_enabled");
    expect(FIXTURES_SQL).not.toContain("entity_type='player'");
    expect(FIXTURES_SQL).not.toContain("g.status=");
    expect(auditLineups(fixture()).ready).toBe(true);
  });
  test("a starter without rating or minutes remains pending, never a DNP", () => {
    const d = fixture();
    const p = d.players[0]!;
    const r = auditLineups({ ...d, players: [{ ...p, stats: null }, ...d.players.slice(1)] });
    expect(r.ready).toBe(false);
    expect(r.players[0]!.appeared).toBe(true);
    expect(r.missingRatingIds).toEqual(["1"]);
  });
  test("an unrated late substitute holds the fixture", () => {
    const d = fixture();
    const p = d.players[0]!;
    expect(
      auditLineups({
        ...d,
        players: [
          ...d.players,
          {
            ...p,
            externalId: "99",
            starter: false,
            stats: { ...p.stats!, minutesPlayed: 1, rating: null },
          },
        ],
      }).ready,
    ).toBe(false);
  });
  test("unused bench is a DNP; unknown substitute minutes stay pending", () => {
    const d = fixture();
    const p = d.players[0]!;
    expect(
      auditLineups({
        ...d,
        players: [...d.players, { ...p, externalId: "99", starter: false, stats: null }],
      }).ready,
    ).toBe(true);
    expect(
      auditLineups({
        ...d,
        players: [
          ...d.players,
          {
            ...p,
            externalId: "99",
            starter: false,
            stats: { ...p.stats!, minutesPlayed: null, rating: null },
          },
        ],
      }).ready,
    ).toBe(false);
  });
  test("incomplete sides and duplicate API IDs cannot look ready", () => {
    const d = fixture();
    expect(auditLineups({ ...d, players: d.players.slice(1) }).ready).toBe(false);
    expect(() => auditLineups({ ...d, players: [...d.players, d.players[0]!] })).toThrow(
      "ratings_player_id_invalid",
    );
  });
});
