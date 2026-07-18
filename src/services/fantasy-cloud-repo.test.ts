// @ts-nocheck
import { describe, it, expect } from "bun:test";
import {
  FantasyCloudError,
  mapSupabaseError,
  validateSquadShape,
} from "./fantasy-cloud-repo";
import { MissingIdMappingError } from "./fantasy-id-map";

describe("mapSupabaseError", () => {
  it("preserves an existing FantasyCloudError", () => {
    const e = new FantasyCloudError("network", "boom");
    expect(mapSupabaseError(e)).toBe(e);
  });
  it("wraps MissingIdMappingError as id_mapping_unavailable and carries missing ids", () => {
    const err = new MissingIdMappingError({ missingPlayers: ["fp_x", "fp_y"] });
    const mapped = mapSupabaseError(err);
    expect(mapped.code).toBe("id_mapping_unavailable");
    expect(mapped.missingIds?.players).toEqual(["fp_x", "fp_y"]);
  });
  it("maps 40001 to version_conflict", () => {
    expect(mapSupabaseError({ code: "40001", message: "Version conflict" }).code).toBe("version_conflict");
  });
  it("maps 42501 / Not authenticated to unauthenticated", () => {
    expect(mapSupabaseError({ code: "42501", message: "" }).code).toBe("unauthenticated");
    expect(mapSupabaseError({ message: "Not authenticated" }).code).toBe("unauthenticated");
  });
  it("maps P0002 / not found to not_found", () => {
    expect(mapSupabaseError({ code: "P0002", message: "" }).code).toBe("not_found");
  });
  it("maps PGRST301 / RLS to permission_denied", () => {
    expect(mapSupabaseError({ code: "PGRST301", message: "" }).code).toBe("permission_denied");
  });
  it("maps network-like messages to network", () => {
    expect(mapSupabaseError({ message: "Failed to fetch" }).code).toBe("network");
  });
  it("maps 22P02 / check violations to validation", () => {
    expect(mapSupabaseError({ code: "22P02", message: "invalid input syntax" }).code).toBe("validation");
  });
  it("falls back to unknown", () => {
    expect(mapSupabaseError({ message: "weird" }).code).toBe("unknown");
    expect(mapSupabaseError(null).code).toBe("unknown");
  });
});

function baseSquad() {
  return Array.from({ length: 15 }, (_, i) => ({
    playerId: `fp_war_${i + 1}`,
    slot: i + 1,
    isCaptain: i === 9,
    isViceCaptain: i === 10,
  }));
}

describe("validateSquadShape", () => {
  it("accepts a valid squad", () => {
    expect(() => validateSquadShape(baseSquad(), "4-4-2")).not.toThrow();
  });
  it("rejects wrong squad length", () => {
    expect(() => validateSquadShape(baseSquad().slice(0, 14), "4-4-2")).toThrow(FantasyCloudError);
  });
  it("rejects duplicate players", () => {
    const s = baseSquad();
    s[1].playerId = s[0].playerId;
    expect(() => validateSquadShape(s, "4-4-2")).toThrow(/Duplicate player/);
  });
  it("rejects duplicate slots", () => {
    const s = baseSquad();
    s[1].slot = 1;
    expect(() => validateSquadShape(s, "4-4-2")).toThrow(/Duplicate slot/);
  });
  it("rejects missing captain / vice / captain==vice", () => {
    const s1 = baseSquad(); s1[9].isCaptain = false;
    expect(() => validateSquadShape(s1, "4-4-2")).toThrow(/Missing captain/);
    const s2 = baseSquad(); s2[10].isViceCaptain = false;
    expect(() => validateSquadShape(s2, "4-4-2")).toThrow(/Missing vice/);
    const s3 = baseSquad(); s3[9].isViceCaptain = true;
    expect(() => validateSquadShape(s3, "4-4-2")).toThrow(/must differ/);
  });
  it("rejects illegal formation", () => {
    expect(() => validateSquadShape(baseSquad(), "9-9-9" as any)).toThrow(/Illegal formation/);
  });
});
