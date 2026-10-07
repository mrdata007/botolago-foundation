import { describe, it, expect } from "bun:test";
import "./__test-shim";

import {
  applyAutocompleteTemplate,
  buildAutocompleteDraft,
  buildEmptySlots,
  computeSummary,
  draftPurchasePrices,
  draftToSquad,
  initCreateDraft,
  placePlayer,
  removePlayer,
  setCaptain,
  setTeamName,
  TEAM_NAME_MAX_LENGTH,
  validateDraft,
  validateTeamName,
  normalizeTeamName,
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
  });
  it("matches the server's rule: 3+ characters, letters/digits at both ends", () => {
    // api.create_fantasy_team refuses these; they used to pass here and fail
    // only after the whole squad had been built.
    expect(validateTeamName("Jo")).toEqual({ ok: false, error: "too_short" });
    expect(validateTeamName("Wydad FC!")).toEqual({ ok: false, error: "invalid_characters" });
    expect(validateTeamName("-Raja")).toEqual({ ok: false, error: "invalid_characters" });
    // Production's ICU [[:alnum:]] accepts these (measured 2026-09-24).
    for (const name of ["فريق الأطلس", "Équipe Élite", "L'Atlas 11", "Raja-2026", "١٢٣ نجوم"]) {
      expect({ name, ok: validateTeamName(name).ok }).toEqual({ name, ok: true });
    }
  });
  it("folds typographic apostrophes to the one the server allows", () => {
    expect(normalizeTeamName("  L’Atlas 11 ")).toBe("L'Atlas 11");
    expect(validateTeamName("L’Atlas 11").ok).toBe(true);
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
    // The armband leaves with the player; nobody is given it in his place.
    expect(d3.slots.some((s) => s.isCaptain)).toBe(false);
  });
});

describe("fantasy-create-service — the captain is the manager's choice", () => {
  /**
   * Fill all 15 slots of a 4-4-2 draft by hand, in slot order, the way a
   * manager does: one pick per slot, cheapest first, three per club at most.
   */
  function fullDraft() {
    const byPrice = [...players].sort((a, b) => a.price - b.price || a.id.localeCompare(b.id));
    const clubs = new Map<string, number>();
    let d = setTeamName(initCreateDraft(), "Atlas FC");
    for (const slot of d.slots) {
      const player = byPrice.find(
        (p) =>
          p.position === slot.position &&
          !d.slots.some((s) => s.playerId === p.id) &&
          (clubs.get(p.clubId) ?? 0) < 3,
      )!;
      clubs.set(player.clubId, (clubs.get(player.clubId) ?? 0) + 1);
      d = placePlayer(d, slot.slot, player.id);
    }
    return d;
  }

  it("building a squad by hand gives nobody the armband", () => {
    const d = fullDraft();
    expect(d.slots.every((s) => s.playerId)).toBe(true);
    expect(d.slots.some((s) => s.isCaptain || s.isViceCaptain)).toBe(false);
    // So the save gate asks for both, which the last step's captain section
    // answers; the server's own check is unchanged.
    const v = validateDraft(d, players);
    expect(v.errors).toContain("captain_missing");
    expect(v.errors).toContain("vice_missing");
  });

  it("an explicit captain and vice-captain among the starters make the squad valid", () => {
    const d = fullDraft();
    const starters = d.slots.filter((s) => s.slot < 12);
    const chosen = setCaptain(setCaptain(d, starters[3].playerId!), starters[6].playerId!, true);
    expect(validateDraft(chosen, players)).toEqual({ ok: true, errors: [] });
    const squad = draftToSquad(chosen);
    expect(squad.find((s) => s.isCaptain)?.slot).toBe(starters[3].slot);
    expect(squad.find((s) => s.isViceCaptain)?.slot).toBe(starters[6].slot);
  });

  it("a substitute cannot be made captain or vice-captain", () => {
    const d = fullDraft();
    const benchPlayer = d.slots.find((s) => s.slot === 15)!.playerId!;
    expect(setCaptain(d, benchPlayer)).toBe(d);
    expect(setCaptain(d, benchPlayer, true)).toBe(d);
  });

  it("a player brought into the captain's slot does not inherit the armband", () => {
    const d = fullDraft();
    const captainSlot = d.slots.find((s) => s.slot === 2)!;
    const withCaptain = setCaptain(d, captainSlot.playerId!);
    const replacement = players.find(
      (p) => p.position === "DEF" && !withCaptain.slots.some((s) => s.playerId === p.id),
    )!;
    const replaced = placePlayer(withCaptain, 2, replacement.id);
    expect(replaced.slots.find((s) => s.slot === 2)!.isCaptain).toBe(false);
    expect(replaced.slots.some((s) => s.isCaptain)).toBe(false);
    // Placing the same player again keeps it.
    expect(placePlayer(withCaptain, 2, captainSlot.playerId!).slots[1].isCaptain).toBe(true);
  });
});

describe("fantasy-create-service — validation", () => {
  it("empty draft: reports team_name + size", () => {
    const v = validateDraft(initCreateDraft(), players);
    expect(v.ok).toBe(false);
    expect(v.errors).toContain("team_name");
    expect(v.errors).toContain("size");
  });

  it("valid template autocompletes to a full 15-player draft with captain/vice", async () => {
    const template = await fantasyService.getTeam();
    const d0 = setTeamName(initCreateDraft(), "Test XI");
    const merged = applyAutocompleteTemplate(d0, template.squad, players);
    expect(merged).not.toBeNull();
    const s = computeSummary(merged!, players);
    expect(s.filled).toBe(15);
    expect(s.perPosition.GK).toEqual({ filled: 2, required: 2 });
    expect(s.perPosition.DEF).toEqual({ filled: 5, required: 5 });
    expect(s.perPosition.MID).toEqual({ filled: 5, required: 5 });
    expect(s.perPosition.FWD).toEqual({ filled: 3, required: 3 });
    expect(s.hasCaptain).toBe(true);
    expect(s.hasVice).toBe(true);
    expect(s.captainViceDistinct).toBe(true);
  });

  it("builds a deterministic valid proposal for a first-time user", () => {
    const first = buildAutocompleteDraft(initCreateDraft("First Team"), players);
    const second = buildAutocompleteDraft(initCreateDraft("First Team"), [...players].reverse());
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
    const s = computeSummary(d1, players, 0);
    expect(s.overBudget).toBe(true);
  });
});

describe("fantasy-create-service — save payload", () => {
  it("draftToSquad preserves captain / vice / slot", async () => {
    const template = await fantasyService.getTeam();
    const d = applyAutocompleteTemplate(
      setTeamName(initCreateDraft(), "T"),
      template.squad,
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

describe("a damaged first-squad draft in browser storage", () => {
  it("is not a draft, so nothing reads its slots", async () => {
    const { isCreateDraft } = await import("./fantasy-create-draft");
    expect(isCreateDraft({ teamName: "X", slots: Array.from({ length: 15 }, () => null) })).toBe(
      false,
    );
    expect(
      isCreateDraft({ teamName: "X", slots: Array.from({ length: 15 }, (_, i) => ({ slot: i })) }),
    ).toBe(true);
  });
});
