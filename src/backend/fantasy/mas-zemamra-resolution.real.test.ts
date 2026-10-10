import { describe, expect, test } from "bun:test";
import { masZemamraPlan } from "../../../scripts/backend/mas-zemamra-canary-plan";
import { resolveMasZemamra } from "../../../scripts/backend/resolve-mas-zemamra-identities";

const resolution = await resolveMasZemamra();
const plan = await masZemamraPlan();
const row = (id: string) => resolution.rows.find((r) => r.externalId === id)!;

describe("Maghreb Fes - Zemamra: the 22 unresolved Sofascore identities", () => {
  test("exactly 22, none of them has a reviewed mapping, and the classes add up", () => {
    expect(resolution.appearing).toBe(31);
    expect(resolution.unresolved).toBe(22);
    expect(resolution.byClass).toEqual({
      MAPPING_EVIDENCE_INSUFFICIENT: 11,
      EXISTING_CANONICAL_PLAYER_IDENTIFIED: 7,
      MEMBERSHIP_CORRECTION_NEEDED: 2,
      CANDIDATE_RECORD_MISSING: 2,
    });
  });

  test("the seven identified players differ from the catalogue by position (5) or shirt (2) only, never by club", () => {
    const identified = resolution.rows.filter(
      (r) => r.resolution.classification === "EXISTING_CANONICAL_PLAYER_IDENTIFIED",
    );
    expect(identified.flatMap((r) => r.resolution.attributeConflicts).sort()).toEqual([
      "position",
      "position",
      "position",
      "position",
      "position",
      "shirt",
      "shirt",
    ]);
    for (const r of identified) {
      expect(r.resolution.targetAppPlayerId).not.toBeNull();
      expect(r.resolution.identityConfidence).toBe("HIGH");
    }
    // The distinct targets are distinct players: no two Sofascore ids point at one canonical player.
    const targets = identified.map((r) => r.resolution.targetAppPlayerId);
    expect(new Set(targets).size).toBe(7);
  });

  test("the two membership questions: one in a locked Fantasy squad at another club, one with no active membership", () => {
    expect(row("1213241").resolution.code).toBe("CATALOGUE_PLACES_HIM_AT_ANOTHER_CLUB");
    expect(row("1213241").resolution.fantasy.inLockedSquad).toBe(true);
    expect(row("2161842").resolution.code).toBe("CATALOGUE_HAS_NO_ACTIVE_MEMBERSHIP");
  });

  test("the goalkeeper has no review-workflow record: a missing record, not a missing player", () => {
    const goalkeeper = row("919753");
    expect(goalkeeper.lineupPosition).toBe("G");
    expect(goalkeeper.resolution.classification).toBe("CANDIDATE_RECORD_MISSING");
    expect(goalkeeper.resolution.targetAppPlayerId).toBeNull();
    expect(row("1866448").resolution.classification).toBe("CANDIDATE_RECORD_MISSING");
  });

  test("a date that already belongs to another Sofascore id is never turned into a second mapping", () => {
    expect(row("2776291").resolution.code).toBe("TARGET_ALREADY_REPRESENTED");
    expect(row("2776291").resolution.targetAppPlayerId).toBeNull();
  });

  test("nothing in the output is a name or a birth date", () => {
    const text = JSON.stringify(resolution);
    expect(text).not.toMatch(/\b\d{4}-\d{2}-\d{2}\b/);
    expect(text).not.toMatch(/displayName|fullName|birthDate/);
  });
});

describe("the three worlds, kept apart", () => {
  const {
    A_CURRENT_REVIEWED_PRODUCTION: A,
    B_PLUS_EXECUTABLE_FLASHSCORE_ROWS_HYPOTHETICAL: B,
    C_PLUS_CATALOGUE_IDENTIFIED_SOFASCORE_HYPOTHETICAL: C,
  } = plan.worlds;

  test("A is today: 22 Sofascore and 31 Flashscore players still have no reviewed mapping", () => {
    expect(A.sofascoreUnresolved).toBe(22);
    expect(A.flashscoreUnresolved).toBe(31);
  });

  test("B adds only the executable Flashscore rows of this match (7 of 42): Flashscore 31 -> 24, Sofascore unchanged", () => {
    expect(plan.flashscoreRowsInThisMatch).toBe(7);
    expect(B.flashscoreUnresolved).toBe(24);
    expect(B.sofascoreUnresolved).toBe(22);
  });

  test("C adds the seven catalogue-identified Sofascore identities: Sofascore 22 -> 15", () => {
    expect(C.sofascoreUnresolved).toBe(15);
    expect(C.sofascoreUnresolvedWithScoringIncidents).toBe(1);
  });

  test("the match is NOT complete in any world: identities stay unresolved, so ingestion is not ready", () => {
    for (const world of [A, B, C]) {
      expect(world.stages.identityResolved).toBe(false);
      expect(world.stages.ingestionReady).toBe(false);
      // The other three stages are a separate finding and do hold.
      expect(world.stages.eventsReconciled).toBe(true);
      expect(world.stages.participationEstablished).toBe(true);
      expect(world.stages.scoringFieldsReady).toBe(true);
    }
  });

  test("what C still lacks, by name: the goalkeeper and a scorer, both unresolved", () => {
    expect(plan.scoringRelevantStillUnresolvedAfterC.sort()).toEqual(["1939981", "919753"]);
    expect(plan.stillUnresolvedAfterC).toHaveLength(15);
    // Two more Flashscore ids get evidence only after those Sofascore mappings exist (a later batch).
    expect(plan.flashscoreRowsUnlockedByC).toHaveLength(2);
  });
});
