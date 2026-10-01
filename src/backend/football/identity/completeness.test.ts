import { describe, expect, test } from "bun:test";
import {
  absenceEvidence,
  assessCompleteness,
  EXTREME_DISAGREEMENT_RATIO,
  MIN_CONSERVATIVE_SQUAD_PLAYERS,
} from "./completeness";
import { normalizeFlashscoreSquad } from "./flashscore-squad";
import { normalizeSofascoreSquad } from "./sofascore-squad";
import {
  flashPayload,
  flashSquadEntries,
  NOW,
  sofaPayload,
  sofaSquadEntries,
} from "./test-support";

const sofa = (n: number) => normalizeSofascoreSquad(sofaPayload(sofaSquadEntries(n)), 100, NOW);
const flash = (n: number) =>
  normalizeFlashscoreSquad(flashPayload(flashSquadEntries(n)), "TEAM0001");

describe("assessCompleteness", () => {
  test("a normal squad is complete", () => {
    expect(assessCompleteness({ fetched: true, parsed: sofa(30), comparisonCounts: [28] })).toEqual(
      { state: "COMPLETE", reasons: [] },
    );
  });

  test("a squad below the conservative minimum is INCOMPLETE_PROVIDER_SQUAD (a 16-player Flashscore squad, no club named)", () => {
    const result = assessCompleteness({ fetched: true, parsed: flash(16), comparisonCounts: [26] });
    expect(result.state).toBe("INCOMPLETE_PROVIDER_SQUAD");
    // 16 against 26 is not an extreme ratio; the minimum is what catches it.
    expect(result.reasons).toEqual(["below_conservative_minimum"]);
  });

  test("the minimum is exactly 18", () => {
    expect(MIN_CONSERVATIVE_SQUAD_PLAYERS).toBe(18);
    expect(
      assessCompleteness({ fetched: true, parsed: flash(18), comparisonCounts: [] }).state,
    ).toBe("COMPLETE");
    expect(
      assessCompleteness({ fetched: true, parsed: flash(17), comparisonCounts: [] }).state,
    ).toBe("INCOMPLETE_PROVIDER_SQUAD");
  });

  test("extreme disagreement with another provider or the app catalog is flagged", () => {
    const parsed = flash(20);
    const limit = Math.ceil(20 / EXTREME_DISAGREEMENT_RATIO);
    expect(assessCompleteness({ fetched: true, parsed, comparisonCounts: [limit - 1] }).state).toBe(
      "COMPLETE",
    );
    expect(
      assessCompleteness({ fetched: true, parsed, comparisonCounts: [limit + 1] }).reasons,
    ).toEqual(["extreme_disagreement_with_comparison"]);
    expect(
      assessCompleteness({ fetched: true, parsed, comparisonCounts: [5, limit + 1] }).state,
    ).toBe("INCOMPLETE_PROVIDER_SQUAD");
  });

  test("a size gap that is ordinary (27 against 43) is not flagged by itself", () => {
    expect(
      assessCompleteness({ fetched: true, parsed: flash(27), comparisonCounts: [43] }).state,
    ).toBe("COMPLETE");
  });

  test("obvious truncation: many malformed entries, or no goalkeeper where positions are known", () => {
    const malformed = normalizeFlashscoreSquad(
      {
        DATA: [
          {
            ITEMS: [
              ...flashSquadEntries(20).map((e) => ({
                PLAYER_ID: e.id,
                PLAYER_TYPE_ID: "DEFENDER",
                PLAYER_NAME: "x",
                PLAYER_JERSEY_NUMBER: 1,
                PLAYER_FLAG_ID: 1,
              })),
              ...Array.from({ length: 6 }, () => ({})),
            ],
          },
        ],
      },
      "TEAM0001",
    );
    expect(
      assessCompleteness({ fetched: true, parsed: malformed, comparisonCounts: [] }).reasons,
    ).toContain("malformed_entries");
    const noKeeper = normalizeFlashscoreSquad(
      flashPayload(flashSquadEntries(25).map((e) => ({ ...e, type: "DEFENDER" }))),
      "TEAM0001",
    );
    expect(
      assessCompleteness({ fetched: true, parsed: noKeeper, comparisonCounts: [] }).reasons,
    ).toEqual(["no_goalkeeper_listed"]);
  });

  test("a failed, empty or misshapen response is incomplete", () => {
    expect(
      assessCompleteness({ fetched: false, parsed: null, comparisonCounts: [] }).reasons,
    ).toEqual(["fetch_failed"]);
    expect(
      assessCompleteness({ fetched: true, parsed: null, comparisonCounts: [] }).reasons,
    ).toEqual(["invalid_payload"]);
    expect(
      assessCompleteness({ fetched: true, parsed: flash(0), comparisonCounts: [] }).reasons,
    ).toContain("empty_response");
  });
});

describe("absence is not negative evidence from an incomplete squad", () => {
  const players = flash(16).players;

  test("a player present is positive evidence regardless of completeness", () => {
    const squad = {
      players,
      completeness: { state: "INCOMPLETE_PROVIDER_SQUAD", reasons: ["below_conservative_minimum"] },
    } as const;
    expect(absenceEvidence(squad, players[3]!.externalPlayerId)).toEqual({ kind: "present" });
  });

  test("absence from an incomplete squad is no signal: no 'not at club', no ignore suggestion", () => {
    const squad = {
      players,
      completeness: { state: "INCOMPLETE_PROVIDER_SQUAD", reasons: ["below_conservative_minimum"] },
    } as const;
    expect(absenceEvidence(squad, "SOMEONE-ELSE")).toEqual({
      kind: "no_signal",
      reason: "incomplete_provider_squad",
    });
  });

  test("absence from a complete squad is only context, never an action", () => {
    const squad = { players, completeness: { state: "COMPLETE", reasons: [] } } as const;
    expect(absenceEvidence(squad, "SOMEONE-ELSE")).toEqual({ kind: "absent_from_complete_squad" });
  });
});
