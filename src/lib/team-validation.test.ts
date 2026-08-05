import { describe, expect, it } from "bun:test";
import { hasSquadCatalogCoverage, validateTeam } from "./team-validation";
import type { FantasyPlayer, SquadPlayer } from "@/types/fantasy";

// Minimal fixture: 15 players — 2 GK, 5 DEF, 5 MID, 3 FWD.
const players: FantasyPlayer[] = [
  ...Array.from({ length: 2 }, (_, i) => ({
    id: `gk${i}`,
    position: "GK",
    clubId: "c1",
    name: { fr: "GK", ar: "GK" },
    price: 5,
    totalPoints: 0,
  })),
  ...Array.from({ length: 5 }, (_, i) => ({
    id: `d${i}`,
    position: "DEF",
    clubId: "c1",
    name: { fr: "D", ar: "D" },
    price: 5,
    totalPoints: 0,
  })),
  ...Array.from({ length: 5 }, (_, i) => ({
    id: `m${i}`,
    position: "MID",
    clubId: "c1",
    name: { fr: "M", ar: "M" },
    price: 5,
    totalPoints: 0,
  })),
  ...Array.from({ length: 3 }, (_, i) => ({
    id: `f${i}`,
    position: "FWD",
    clubId: "c1",
    name: { fr: "F", ar: "F" },
    price: 5,
    totalPoints: 0,
  })),
] as any;

// 4-4-2 legal squad. Slots 1..11 = XI, 12..15 = bench (matches reslotForFormation).
function build442(): SquadPlayer[] {
  const ids = [
    "gk0",
    "d0",
    "d1",
    "d2",
    "d3",
    "m0",
    "m1",
    "m2",
    "m3",
    "f0",
    "f1",
    "gk1",
    "d4",
    "m4",
    "f2",
  ];
  return ids.map((id, i) => ({
    playerId: id,
    slot: i + 1,
    isCaptain: id === "f0",
    isViceCaptain: id === "m0",
  })) as any;
}

describe("validateTeam", () => {
  it("detects when the refreshed catalog no longer covers the authoritative squad", () => {
    expect(hasSquadCatalogCoverage(build442(), players)).toBe(true);
    expect(
      hasSquadCatalogCoverage(
        build442(),
        players.filter((player) => player.id !== "f2"),
      ),
    ).toBe(false);
  });

  it("accepts a legal 4-4-2 squad", () => {
    expect(validateTeam(build442(), "4-4-2", players)).toEqual({ ok: true });
  });
  it("rejects size != 15", () => {
    const s = build442().slice(0, 14);
    expect(validateTeam(s, "4-4-2", players)).toEqual({ ok: false, error: "invalid_size" });
  });
  it("rejects wrong formation counts", () => {
    // Claim 4-3-3 with 4-4-2 XI.
    expect(validateTeam(build442(), "4-3-3", players)).toEqual({
      ok: false,
      error: "invalid_formation",
    });
  });
  it("rejects a formation disabled by the active ruleset", () => {
    const rules = {
      totalSize: 15,
      startingSize: 11,
      perPosition: { GK: 2, DEF: 5, MID: 5, FWD: 3 },
      startingMinimum: { GK: 1, DEF: 5, MID: 3, FWD: 2 },
      startingMaximum: { GK: 1, DEF: 5, MID: 4, FWD: 3 },
    } as const;
    expect(validateTeam(build442(), "4-4-2", players, rules)).toEqual({
      ok: false,
      error: "invalid_formation",
    });
  });
  it("rejects captain and vice being the same player", () => {
    const s = build442().map((sp) => ({
      ...sp,
      isCaptain: sp.playerId === "f0",
      isViceCaptain: sp.playerId === "f0",
    }));
    expect(validateTeam(s, "4-4-2", players)).toEqual({ ok: false, error: "captain_vice_same" });
  });
  it("rejects captain on the bench", () => {
    const s = build442().map((sp) => ({
      ...sp,
      isCaptain: sp.playerId === "gk1", // slot 11 (bench)
      isViceCaptain: sp.playerId === "m0",
    }));
    expect(validateTeam(s, "4-4-2", players)).toEqual({ ok: false, error: "captain_not_in_xi" });
  });
  it("rejects vice on the bench", () => {
    const s = build442().map((sp) => ({
      ...sp,
      isCaptain: sp.playerId === "f0",
      isViceCaptain: sp.playerId === "gk1",
    }));
    expect(validateTeam(s, "4-4-2", players)).toEqual({ ok: false, error: "vice_not_in_xi" });
  });
  it("rejects when no captain is set", () => {
    const s = build442().map((sp) => ({ ...sp, isCaptain: false }));
    expect(validateTeam(s, "4-4-2", players)).toEqual({ ok: false, error: "no_captain" });
  });
});
