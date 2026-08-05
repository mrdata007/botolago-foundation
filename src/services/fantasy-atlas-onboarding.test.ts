import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import "./__test-shim";

import type { FantasyRulesDto } from "@/backend/fantasy/contracts";
import { fantasyPlayers } from "@/mocks/fantasy-data";
import { clubs } from "@/mocks/data";
import type { FantasyPlayer } from "@/types/fantasy";
import {
  adaptFantasyRules,
  buildAutocompleteDraft,
  computeSummary,
  DEFAULT_CREATE_TEAM_RULES,
  draftToSquad,
  getPlayerSelectionIssue,
  initCreateDraft,
  placePlayer,
  reconcileCreateDraft,
  removePlayer,
  setCaptain,
  setConsentAccepted,
  setFormation,
  swapSlots,
  validateDraft,
  validateTeamName,
} from "./fantasy-create-service";

const players = fantasyPlayers;

function activeRulesDto(): FantasyRulesDto {
  return {
    seasonId: "00000000-0000-4000-8000-000000000001",
    rulesetId: "00000000-0000-4000-8000-000000000002",
    rulesetCode: "botola_v1",
    rulesetVersion: 1,
    rulesetSemanticVersion: "1.0.0",
    squadSize: 15,
    budget: 100,
    maxPlayersPerClub: 3,
    initialFreeTransfers: 1,
    maxFreeTransferRollover: 5,
    transferHitCost: 4,
    captainMultiplier: 2,
    tripleCaptainMultiplier: 3,
    deadline: { minutesBeforeFirstFixture: 90, gracePeriodSeconds: 0 },
    positions: [
      {
        code: "GK",
        squadQuota: 2,
        startingMinimum: 1,
        startingMaximum: 1,
        goalPoints: 6,
        cleanSheetPoints: 4,
      },
      {
        code: "DEF",
        squadQuota: 5,
        startingMinimum: 3,
        startingMaximum: 5,
        goalPoints: 6,
        cleanSheetPoints: 4,
      },
      {
        code: "MID",
        squadQuota: 5,
        startingMinimum: 2,
        startingMaximum: 5,
        goalPoints: 5,
        cleanSheetPoints: 1,
      },
      {
        code: "FWD",
        squadQuota: 3,
        startingMinimum: 1,
        startingMaximum: 3,
        goalPoints: 4,
        cleanSheetPoints: 0,
      },
    ],
    scoring: [],
    chips: [],
    features: null,
  };
}

function completeDraft() {
  const draft = buildAutocompleteDraft(
    setConsentAccepted(initCreateDraft("Atlas QA"), true),
    players,
  );
  if (!draft) throw new Error("Mock catalog must support a valid Atlas squad.");
  return draft;
}

describe("Atlas Matchday onboarding matrix", () => {
  it("adapts the active ruleset without changing its authoritative limits", () => {
    const rules = adaptFantasyRules(activeRulesDto());
    expect(rules).toEqual(DEFAULT_CREATE_TEAM_RULES);
  });

  it("fails closed when a ruleset is incomplete or has an unsupported quota", () => {
    const missingPosition = activeRulesDto();
    missingPosition.positions = missingPosition.positions.slice(0, 3);
    expect(adaptFantasyRules(missingPosition)).toBeNull();

    const wrongQuota = activeRulesDto();
    wrongQuota.positions[1] = { ...wrongQuota.positions[1], squadQuota: 4 };
    expect(adaptFantasyRules(wrongQuota)).toBeNull();
  });

  it("matches the server team-name contract for French and Arabic names", () => {
    expect(validateTeamName("Étoile Atlas").ok).toBe(true);
    expect(validateTeamName("أسود الأطلس").ok).toBe(true);
    expect(validateTeamName("Atlas!").ok).toBe(false);
  });

  it("keeps identity incomplete until explicit consent is recorded", () => {
    const draft = initCreateDraft("Atlas Club");
    expect(validateDraft(draft, players).errors).toContain("consent");
    expect(validateDraft(setConsentAccepted(draft, true), players).errors).not.toContain("consent");
  });

  it("migrates a legacy persisted draft into the versioned schema", () => {
    const legacy = {
      teamName: "Legacy Atlas",
      favoriteClubId: clubs[0].id,
      formation: "4-4-2",
      slots: initCreateDraft().slots,
    };
    const migrated = reconcileCreateDraft(legacy, players, clubs);
    expect(migrated.schemaVersion).toBe(1);
    expect(migrated.teamName).toBe("Legacy Atlas");
    expect(migrated.favoriteClubId).toBe(clubs[0].id);
    expect(migrated.consentAccepted).toBe(false);
  });

  it("reconciles stale, duplicate, and unavailable persisted selections", () => {
    const goalkeeper = players.find((player) => player.position === "GK")!;
    const unavailable = {
      ...players.find((player) => player.position === "MID")!,
      id: "unavailable-midfielder",
      status: "unavailable" as const,
    };
    const raw = initCreateDraft("Saved Atlas");
    raw.slots[0].playerId = goalkeeper.id;
    raw.slots[1].playerId = "missing-player";
    raw.slots[5].playerId = unavailable.id;
    raw.slots[11].playerId = goalkeeper.id;

    const reconciled = reconcileCreateDraft(raw, [...players, unavailable], clubs);
    expect(reconciled.slots.filter((slot) => slot.playerId === goalkeeper.id)).toHaveLength(1);
    expect(reconciled.slots.some((slot) => slot.playerId === "missing-player")).toBe(false);
    expect(reconciled.slots.some((slot) => slot.playerId === unavailable.id)).toBe(false);
  });

  it("updates live player count, positional progress, cost, and bank", () => {
    const goalkeeper = players.find((player) => player.position === "GK")!;
    const summary = computeSummary(placePlayer(initCreateDraft(), 1, goalkeeper.id), players);
    expect(summary.filled).toBe(1);
    expect(summary.perPosition.GK.filled).toBe(1);
    expect(summary.totalCost).toBe(goalkeeper.price);
    expect(summary.bankRemaining).toBeCloseTo(100 - goalkeeper.price, 1);
  });

  it("returns an explicit duplicate reason before a repeated pick", () => {
    const goalkeeper = players.find((player) => player.position === "GK")!;
    const draft = placePlayer(initCreateDraft(), 1, goalkeeper.id);
    expect(getPlayerSelectionIssue(draft, 12, goalkeeper, players)).toBe("duplicate");
  });

  it("returns an explicit club-limit reason at the active limit", () => {
    const goalkeepers = players.filter((player) => player.position === "GK");
    const selected = goalkeepers[0];
    const candidate: FantasyPlayer = {
      ...goalkeepers[1],
      id: "same-club-goalkeeper",
      clubId: selected.clubId,
    };
    const rules = { ...DEFAULT_CREATE_TEAM_RULES, maxPerClub: 1 };
    const draft = placePlayer(initCreateDraft("Atlas", { rules }), 1, selected.id);
    expect(getPlayerSelectionIssue(draft, 12, candidate, [...players, candidate], rules)).toBe(
      "club_limit",
    );
  });

  it("returns explicit budget and availability reasons for disabled picks", () => {
    const goalkeeper = players.find((player) => player.position === "GK")!;
    const tinyBudgetRules = { ...DEFAULT_CREATE_TEAM_RULES, budget: 0.1 };
    const tinyDraft = initCreateDraft("Atlas", { rules: tinyBudgetRules });
    expect(getPlayerSelectionIssue(tinyDraft, 1, goalkeeper, players, tinyBudgetRules)).toBe(
      "budget",
    );

    const unavailable = { ...goalkeeper, id: "blocked-gk", status: "ineligible" as const };
    expect(
      getPlayerSelectionIssue(initCreateDraft(), 1, unavailable, [...players, unavailable]),
    ).toBe("unavailable");
  });

  it("re-slots a complete squad across supported formations without losing players", () => {
    const original = completeDraft();
    const reslotted = setFormation(original, "3-5-2", players);
    const originalIds = original.slots.map((slot) => slot.playerId).toSorted();
    const reslottedIds = reslotted.slots.map((slot) => slot.playerId).toSorted();
    expect(reslottedIds).toEqual(originalIds);
    expect(computeSummary(reslotted, players).formationValid).toBe(true);
  });

  it("keeps captain and vice distinct while preserving reordered bench slots in the payload", () => {
    const complete = completeDraft();
    const starters = complete.slots.filter((slot) => slot.slot <= 11 && slot.playerId);
    const captained = setCaptain(
      setCaptain(complete, starters[0].playerId!),
      starters[1].playerId!,
      true,
    );
    const bench = captained.slots.filter((slot) => slot.slot > 11);
    const reordered = swapSlots(captained, bench[0].slot, bench[1].slot);
    const payload = draftToSquad(reordered);
    expect(payload.find((slot) => slot.isCaptain)?.playerId).toBe(starters[0].playerId);
    expect(payload.find((slot) => slot.isViceCaptain)?.playerId).toBe(starters[1].playerId);
    expect(payload.find((slot) => slot.slot === bench[0].slot)?.playerId).toBe(bench[1].playerId);
  });

  it("opens the final submit gate only for a complete valid team", () => {
    const complete = completeDraft();
    expect(validateDraft(complete, players).ok).toBe(true);
    expect(validateDraft(removePlayer(complete, 15), players).ok).toBe(false);
  });

  it("guards direct create routes for signed-out and existing-team users", () => {
    const source = readFileSync(new URL("../routes/fantasy.create.tsx", import.meta.url), "utf8");
    expect(source).toContain('to="/auth/login" search={{ next: "/fantasy/create" }}');
    expect(source).toContain('to="/fantasy/team"');
  });

  it("renders pitch and list views from the same draft slot collection", () => {
    const source = readFileSync(
      new URL("../components/fantasy/AtlasDraftSquad.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain('view === "list"');
    expect(source).toContain("<Pitch");
    expect(source.match(/draft\.slots/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("keeps the picker accessible and mirrors its desktop edge in RTL", () => {
    const source = readFileSync(
      new URL("../components/fantasy/PlayerPickerDrawer.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain('aria-live="polite"');
    expect(source).toContain('data-player-selectable={reason ? "false" : "true"}');
    expect(source).toContain('dir === "rtl"');
    expect(source).toContain("sm:left-0 sm:right-auto");
    expect(source).toContain("sm:right-0 sm:left-auto");
  });

  it("shows creation confirmation only after an authoritative persistence result", () => {
    const source = readFileSync(
      new URL("../routes/fantasy.create.review.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain("if (result.ok)");
    expect(source).toContain("result.snapshot.team.teamName");
    expect(source).toContain('data-testid="atlas-creation-success"');
    expect(source.indexOf("setCreated({")).toBeGreaterThan(source.indexOf("if (result.ok)"));
  });

  it("uses the real BotolaGO logo asset in the shared team shirt", () => {
    const source = readFileSync(
      new URL("../components/fantasy/AtlasTeamShirt.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain('src="/favicon.png"');
    expect(source).toContain('alt="BotolaGO"');
    expect(source).toContain("<ClubCrest");
  });

  it("keeps recurring edits safe across interruption and reads active rules", () => {
    const teamSource = readFileSync(new URL("../routes/fantasy.team.tsx", import.meta.url), "utf8");
    const transferSource = readFileSync(
      new URL("../routes/fantasy.transfers.tsx", import.meta.url),
      "utf8",
    );
    for (const source of [teamSource, transferSource]) {
      expect(source).toContain('window.addEventListener("beforeunload"');
      expect(source).toContain("adaptFantasyRules");
      expect(source).toContain("FantasyCatalogUnavailable");
    }
    expect(transferSource).toContain("activeRules.maxPerClub");
    expect(transferSource).toContain("activeRules.transferHitCost");
  });
});
