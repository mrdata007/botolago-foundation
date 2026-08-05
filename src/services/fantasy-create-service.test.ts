import { describe, it, expect } from "bun:test";
import "./__test-shim";

import {
  applyAutocompleteTemplate,
  buildAutocompleteDraft,
  buildEmptySlots,
  computeSummary,
  DEFAULT_CREATE_TEAM_RULES,
  draftPurchasePrices,
  draftToSquad,
  initCreateDraft,
  placePlayer,
  removePlayer,
  setCaptain,
  setConsentAccepted,
  setTeamName,
  TEAM_NAME_MAX_LENGTH,
  validateDraft,
  validateTeamName,
} from "./fantasy-create-service";
import { fantasyService } from "./fantasy-mock";
import { fantasyPlayers } from "@/mocks/fantasy-data";

const players = fantasyPlayers;

function pick(pos: "GK" | "DEF" | "MID" | "FWD", n: number): string[] {
  return players
    .filter((p) => p.position === pos)
    .slice(0, n)
    .map((p) => p.id);
}

describe("fantasy-create-service — team name", () => {
  it("rejects empty and too-short names", () => {
    expect(validateTeamName("").ok).toBe(false);
    expect(validateTeamName("   ").ok).toBe(false);
    expect(validateTeamName("a").ok).toBe(false);
    expect(validateTeamName("ab").ok).toBe(false);
  });
  it("accepts normal names and truncates on write", () => {
    expect(validateTeamName("Wydad FC").ok).toBe(true);
    const d = setTeamName(initCreateDraft(), "x".repeat(TEAM_NAME_MAX_LENGTH + 10));
    expect(d.teamName.length).toBe(TEAM_NAME_MAX_LENGTH);
  });
});

describe("fantasy-create-service — slot layout", () => {
  it("builds 15 empty slots with 2/5/5/3 quotas for 4-4-2", () => {
    const slots = buildEmptySlots("4-4-2");
    expect(slots).toHaveLength(15);
    const counts = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
    slots.forEach((s) => counts[s.position]++);
    expect(counts).toEqual({ GK: 2, DEF: 5, MID: 5, FWD: 3 });
    // XI slots are 1..11; bench 12..15
    const xi = slots.filter((s) => s.slot < 12);
    const bench = slots.filter((s) => s.slot >= 12);
    expect(xi).toHaveLength(11);
    expect(bench).toHaveLength(4);
  });
});

describe("fantasy-create-service — place / remove / dedupe", () => {
  it("places a player and returns a new draft", () => {
    const d0 = initCreateDraft("BotolaGO");
    const [gk1] = pick("GK", 1);
    const d1 = placePlayer(d0, 1, gk1);
    expect(d0.slots.find((s) => s.slot === 1)!.playerId).toBeNull();
    expect(d1.slots.find((s) => s.slot === 1)!.playerId).toBe(gk1);
  });

  it("de-dupes when the same player is moved to another slot", () => {
    const d0 = initCreateDraft();
    const [gk1] = pick("GK", 1);
    const d1 = placePlayer(d0, 1, gk1);
    const d2 = placePlayer(d1, 12, gk1); // move to bench GK
    expect(d2.slots.find((s) => s.slot === 1)!.playerId).toBeNull();
    expect(d2.slots.find((s) => s.slot === 12)!.playerId).toBe(gk1);
  });

  it("removePlayer clears captain/vice for that slot", () => {
    const d0 = initCreateDraft();
    const [gk1] = pick("GK", 1);
    const [def1, def2] = pick("DEF", 2);
    const d1 = placePlayer(placePlayer(placePlayer(d0, 1, gk1), 2, def1), 3, def2);
    const d2 = setCaptain(d1, def1);
    expect(d2.slots.find((s) => s.playerId === def1)!.isCaptain).toBe(true);
    const d3 = removePlayer(d2, 2);
    // Captain moves to another XI slot by the default-captaincy invariant.
    const cap = d3.slots.find((s) => s.isCaptain);
    expect(cap?.playerId).not.toBe(def1);
  });
});

describe("fantasy-create-service — validation", () => {
  it("empty draft: reports team_name + size", () => {
    const v = validateDraft(initCreateDraft(), players);
    expect(v.ok).toBe(false);
    expect(v.errors).toContain("team_name");
    expect(v.errors).toContain("size");
  });

  it("rejects a template that no longer satisfies the active club limit", async () => {
    const template = await fantasyService.getTeam();
    const d0 = setTeamName(initCreateDraft(), "Test XI");
    const merged = applyAutocompleteTemplate(d0, template.squad, players);
    expect(merged).toBeNull();
  });

  it("builds a deterministic valid proposal for a first-time user", () => {
    const first = buildAutocompleteDraft(
      setConsentAccepted(initCreateDraft("First Team"), true),
      players,
    );
    const second = buildAutocompleteDraft(
      setConsentAccepted(initCreateDraft("First Team"), true),
      [...players].reverse(),
    );
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(first?.slots).toEqual(second?.slots);
    expect(first && validateDraft(first, players).ok).toBe(true);
  });

  it("fails honestly when the active player pool cannot satisfy squad rules", () => {
    expect(buildAutocompleteDraft(initCreateDraft("First Team"), players.slice(0, 3))).toBeNull();
  });

  it("club limit is flagged when more than 3 players share a club", () => {
    const d0 = setTeamName(initCreateDraft(), "Overpicks");
    // Pick 4 defenders from the same club if available.
    const oneClub = players.filter((p) => p.position === "DEF");
    const byClub: Record<string, string[]> = {};
    oneClub.forEach((p) => {
      (byClub[p.clubId] ||= []).push(p.id);
    });
    const club = Object.values(byClub).find((ids) => ids.length >= 4);
    if (!club) return; // dataset guard; mock data usually has enough
    let d = d0;
    d = placePlayer(d, 2, club[0]);
    d = placePlayer(d, 3, club[1]);
    d = placePlayer(d, 4, club[2]);
    d = placePlayer(d, 5, club[3]);
    const s = computeSummary(d, players);
    expect(s.overClubLimit.length).toBeGreaterThan(0);
    const v = validateDraft(d, players);
    expect(v.errors).toContain("club_limit");
  });

  it("budget is flagged when totalCost > bankStart", () => {
    const d0 = setTeamName(initCreateDraft(), "Rich");
    // Force a tiny bank so any single pick trips the flag.
    const [any] = pick("GK", 1);
    const d1 = placePlayer(d0, 1, any);
    const s = computeSummary(d1, players, DEFAULT_CREATE_TEAM_RULES, 0);
    expect(s.overBudget).toBe(true);
  });
});

describe("fantasy-create-service — save payload", () => {
  it("draftToSquad preserves captain / vice / slot", () => {
    const d = buildAutocompleteDraft(
      setConsentAccepted(initCreateDraft("Atlas Test"), true),
      players,
    )!;
    const squad = draftToSquad(d);
    expect(squad).toHaveLength(15);
    expect(squad.some((s) => s.isCaptain)).toBe(true);
    expect(squad.some((s) => s.isViceCaptain)).toBe(true);
    const prices = draftPurchasePrices(d, players);
    expect(Object.keys(prices)).toHaveLength(15);
  });
});
