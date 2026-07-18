// @ts-nocheck
import { describe, it, expect, beforeEach } from "bun:test";
import {
  buildIdMap,
  mapSquad,
  mapPlayerId,
  mapTransferPair,
  MissingIdMappingError,
  loadIdMap,
  invalidateIdMap,
  __setCachedIdMapForTests,
  getCachedIdMap,
} from "./fantasy-id-map";

const CLUB_ROWS = [
  { id: "uuid-club-war", provider_id: "war" },
  { id: "uuid-club-rca", provider_id: "rca" },
  { id: "uuid-club-asfar", provider_id: "asfar" },
];

const PLAYER_ROWS = Array.from({ length: 15 }, (_, i) => ({
  id: `uuid-p-${i + 1}`,
  provider_id: `fp_war_${i + 1}`,
}));

function fullSquad() {
  return Array.from({ length: 15 }, (_, i) => ({
    playerId: `fp_war_${i + 1}`,
    slot: i + 1,
    isCaptain: i === 9,
    isViceCaptain: i === 10,
  }));
}

beforeEach(() => invalidateIdMap());

describe("buildIdMap", () => {
  it("builds bidirectional maps for clubs and players", () => {
    const m = buildIdMap(CLUB_ROWS, PLAYER_ROWS);
    expect(m.clubIdBySource.get("war")).toBe("uuid-club-war");
    expect(m.clubSourceById.get("uuid-club-war")).toBe("war");
    expect(m.playerIdBySource.get("fp_war_3")).toBe("uuid-p-3");
    expect(m.playerSourceById.get("uuid-p-3")).toBe("fp_war_3");
  });
  it("detects duplicate provider_ids and aggregates them", () => {
    const bad = [...PLAYER_ROWS, { id: "uuid-p-dup", provider_id: "fp_war_1" }];
    try {
      buildIdMap(CLUB_ROWS, bad);
      throw new Error("should throw");
    } catch (e) {
      expect(e).toBeInstanceOf(MissingIdMappingError);
      expect((e as MissingIdMappingError).duplicatePlayerProviderIds).toContain("fp_war_1");
    }
  });
  it("skips rows with null provider_id", () => {
    const m = buildIdMap(
      [...CLUB_ROWS, { id: "uuid-club-x", provider_id: null }],
      PLAYER_ROWS,
    );
    expect(m.clubSourceById.get("uuid-club-x")).toBeUndefined();
  });
});

describe("mapSquad / mapPlayerId / mapTransferPair", () => {
  const idMap = buildIdMap(CLUB_ROWS, PLAYER_ROWS);

  it("maps a full 15-player squad round-trip", () => {
    const mapped = mapSquad(fullSquad(), idMap);
    expect(mapped).toHaveLength(15);
    expect(mapped[9].isCaptain).toBe(true);
    expect(mapped[10].isViceCaptain).toBe(true);
    // round-trip
    for (const row of mapped) {
      expect(idMap.playerSourceById.get(row.playerId)).toBe(row.sourceId);
    }
  });

  it("aggregates every missing player id in one error", () => {
    const squad = fullSquad();
    squad[0].playerId = "fp_missing_1";
    squad[4].playerId = "fp_missing_2";
    try {
      mapSquad(squad, idMap);
      throw new Error("should throw");
    } catch (e) {
      expect(e).toBeInstanceOf(MissingIdMappingError);
      const err = e as MissingIdMappingError;
      expect(err.missingPlayers).toEqual(expect.arrayContaining(["fp_missing_1", "fp_missing_2"]));
      expect(err.missingPlayers).toHaveLength(2);
    }
  });

  it("mapPlayerId throws on unknown", () => {
    expect(() => mapPlayerId("fp_nope", idMap)).toThrow(MissingIdMappingError);
  });

  it("mapTransferPair maps both sides or aggregates", () => {
    const ok = mapTransferPair({ outSourceId: "fp_war_1", inSourceId: "fp_war_2" }, idMap);
    expect(ok.playerOutId).toBe("uuid-p-1");
    expect(ok.playerInId).toBe("uuid-p-2");
    try {
      mapTransferPair({ outSourceId: "fp_x", inSourceId: "fp_y" }, idMap);
      throw new Error("should throw");
    } catch (e) {
      expect((e as MissingIdMappingError).missingPlayers).toEqual(["fp_x", "fp_y"]);
    }
  });
});

describe("loadIdMap (mocked client) with cache", () => {
  function makeClient() {
    let calls = 0;
    const client: any = {
      from(table: string) {
        return {
          select() {
            return {
              not() {
                calls++;
                if (table === "clubs") return Promise.resolve({ data: CLUB_ROWS, error: null });
                return Promise.resolve({ data: PLAYER_ROWS, error: null });
              },
            };
          },
        };
      },
      _calls: () => calls,
    };
    return client;
  }

  it("caches successful loads and honors force refresh", async () => {
    const client = makeClient();
    const a = await loadIdMap(client);
    const b = await loadIdMap(client);
    expect(a).toBe(b); // cached
    await loadIdMap(client, { force: true });
    // clubs+players called twice per load = 4 total after force
    expect(client._calls()).toBe(4);
  });

  it("__setCachedIdMapForTests hook works", () => {
    const idMap = buildIdMap(CLUB_ROWS, PLAYER_ROWS);
    __setCachedIdMapForTests(idMap);
    expect(getCachedIdMap()).toBe(idMap);
  });
});
