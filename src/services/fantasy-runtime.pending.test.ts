import { describe, expect, test } from "bun:test";

import { fantasyPointsSchema, type FantasyPointsDto } from "@/backend/fantasy/contracts";
import { pointsDto } from "./fantasy-runtime";

/**
 * C4/C5 (docs/backend/FANTASY_PENDING_ITEMS.md): the mapping from
 * `api.get_my_fantasy_points` to the points screen's rows.
 *
 * What it guards: a player with no confirmed points row used to become
 * `finalPoints ?? provisionalPoints ?? 0`, which the screen printed as "0" for
 * "we do not know yet". It is `null` now, and a final gameweek is the only
 * place where a missing row is a zero.
 */

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const GW = id(900);
const FIXTURE = id(800);

type PlayerDto = FantasyPointsDto["players"][number];

function player(n: number, overrides: Partial<PlayerDto> = {}): PlayerDto {
  return {
    fantasyPlayerId: id(n),
    slot: "starter",
    slotOrder: n,
    captain: false,
    viceCaptain: false,
    multiplier: 1,
    provisionalPoints: null,
    finalPoints: null,
    didPlay: null,
    minutesPlayed: null,
    events: [],
    ...overrides,
  };
}

function payload(
  players: PlayerDto[],
  overrides: Partial<FantasyPointsDto> = {},
  result: Partial<NonNullable<FantasyPointsDto["result"]>> = {},
): FantasyPointsDto {
  return {
    teamId: id(1),
    gameweekId: GW,
    gameweekStatus: "provisional",
    pointsState: "provisional",
    result: {
      startingPoints: 10,
      benchPoints: 0,
      captainPoints: 0,
      transferHit: 0,
      chipType: null,
      provisionalScore: 10,
      finalScore: null,
      state: "provisional",
      rank: null,
      overallRank: null,
      calculationVersion: 1,
      finalizedAt: null,
      ...result,
    },
    players,
    autoSubstitutions: [],
    ...overrides,
  };
}

const map = (dto: FantasyPointsDto) => pointsDto(5, dto, null)!;

describe("pointsDto: pending is never 0", () => {
  test("a player without a points row is null and pending while the gameweek is not final", () => {
    const row = map(payload([player(1)])).breakdown[0]!;
    expect(row.totalPoints).toBeNull();
    expect(row.pointsStatus).toBe("pending");
    expect(row.status).toBe("provisional");
    expect(row.minutesPlayed).toBeNull();
  });

  test("a final gameweek with no row for a player is a real zero, and says final", () => {
    const dto = payload([player(1)], { pointsState: "final", gameweekStatus: "finalized" });
    const row = map(dto).breakdown[0]!;
    expect(row.totalPoints).toBe(0);
    expect(row.pointsStatus).toBe("final");
    expect(row.status).toBe("final");
  });

  test("the server's own word wins: pointsStatus pending stays null even with a final gameweek", () => {
    const dto = payload([player(1, { pointsStatus: "pending" })], {
      pointsState: "final",
      gameweekStatus: "finalized",
    });
    const row = map(dto).breakdown[0]!;
    expect(row.totalPoints).toBeNull();
    expect(row.pointsStatus).toBe("pending");
    expect(row.status).toBe("provisional");
  });

  test("a genuine 0 stays 0", () => {
    const row = map(payload([player(1, { provisionalPoints: 0, pointsStatus: "provisional" })]))
      .breakdown[0]!;
    expect(row.totalPoints).toBe(0);
    expect(row.pointsStatus).toBe("provisional");
  });

  test("final points win over provisional ones", () => {
    const dto = payload([player(1, { provisionalPoints: 3, finalPoints: 5 })], {
      pointsState: "final",
      gameweekStatus: "finalized",
    });
    expect(map(dto).breakdown[0]!.totalPoints).toBe(5);
  });
});

describe("pointsDto: pending items", () => {
  const cleanSheet = { fixtureId: FIXTURE, category: "clean_sheet", reason: null };
  const appearance = { fixtureId: FIXTURE, category: "appearance", reason: "minutes_conflict" };

  test("carries each pending item, and the player is provisional with them", () => {
    const dto = payload([
      player(1, {
        provisionalPoints: 4,
        pointsStatus: "provisional",
        pendingItems: [cleanSheet, appearance],
      }),
    ]);
    const row = map(dto).breakdown[0]!;
    expect(row.totalPoints).toBe(4);
    expect(row.pendingItems).toEqual([
      { fixtureId: FIXTURE, category: "clean_sheet", reason: null },
      { fixtureId: FIXTURE, category: "appearance", reason: "minutes_conflict" },
    ]);
  });

  test("provisional is never shown as final: pending items beat a final gameweek", () => {
    const dto = payload(
      [player(1, { finalPoints: 4, pendingItems: [cleanSheet] })],
      { pointsState: "final", gameweekStatus: "finalized" },
      { finalScore: 4, state: "final" },
    );
    const row = map(dto).breakdown[0]!;
    expect(row.pointsStatus).toBe("provisional");
    expect(row.status).toBe("provisional");
  });

  test("the team's pendingItemCount is the server's, else the sum over players", () => {
    const players = [
      player(1, { provisionalPoints: 4, pendingItems: [cleanSheet, appearance] }),
      player(2, { provisionalPoints: 2, pendingItems: [cleanSheet] }),
    ];
    expect(map(payload(players)).authoritative!.pendingItemCount).toBe(3);
    expect(map(payload(players, {}, { pendingItemCount: 7 })).authoritative!.pendingItemCount).toBe(
      7,
    );
  });
});

describe("pointsDto: older API responses", () => {
  // Parsed through the real schema: the new keys must be optional there.
  const old = fantasyPointsSchema.parse({
    teamId: id(1),
    gameweekId: GW,
    gameweekStatus: "provisional",
    pointsState: "provisional",
    result: {
      startingPoints: 10,
      benchPoints: 0,
      captainPoints: 0,
      transferHit: 0,
      chipType: null,
      provisionalScore: 10,
      finalScore: null,
      state: "provisional",
      rank: null,
      overallRank: null,
      calculationVersion: 1,
      finalizedAt: null,
    },
    players: [
      {
        fantasyPlayerId: id(1),
        slot: "starter",
        slotOrder: 1,
        captain: false,
        viceCaptain: false,
        multiplier: 1,
        provisionalPoints: 6,
        finalPoints: null,
        didPlay: true,
        minutesPlayed: 90,
        events: [],
      },
      {
        fantasyPlayerId: id(2),
        slot: "starter",
        slotOrder: 2,
        captain: false,
        viceCaptain: false,
        multiplier: 1,
        provisionalPoints: null,
        finalPoints: null,
        didPlay: null,
        minutesPlayed: null,
        events: [],
      },
    ],
    autoSubstitutions: [],
  });

  test("parse without pendingItems, pointsStatus or pendingItemCount", () => {
    expect(old.players[0]!.pendingItems).toBeUndefined();
    expect(old.players[0]!.pointsStatus).toBeUndefined();
    expect(old.result!.pendingItemCount).toBeUndefined();
  });

  test("a row with points reads as it did (provisional, no items) and the count is 0", () => {
    const mapped = map(old);
    expect(mapped.breakdown[0]!.totalPoints).toBe(6);
    expect(mapped.breakdown[0]!.status).toBe("provisional");
    expect(mapped.breakdown[0]!.pendingItems).toEqual([]);
    expect(mapped.authoritative!.pendingItemCount).toBe(0);
    expect(mapped.totalPoints).toBe(10);
  });

  test("an old response with no row no longer reads as 0 while the gameweek is open", () => {
    const row = map(old).breakdown[1]!;
    expect(row.totalPoints).toBeNull();
    expect(row.pointsStatus).toBe("pending");
  });

  test("the new keys parse when present", () => {
    const parsed = fantasyPointsSchema.parse({
      ...old,
      result: { ...old.result, pendingItemCount: 2 },
      players: [
        {
          ...old.players[0],
          pointsStatus: "provisional",
          pendingItems: [{ fixtureId: FIXTURE, category: "clean_sheet", reason: null }],
        },
      ],
    });
    expect(parsed.result!.pendingItemCount).toBe(2);
    expect(parsed.players[0]!.pendingItems).toHaveLength(1);
  });
});
