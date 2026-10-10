import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { assessClass, buildEvidencePlan, type SmHit } from "./mas-zemamra-evidence-plan";

const root = resolve(import.meta.dir, "../..");
const plan = await buildEvidencePlan();
const catalogue = JSON.parse(
  readFileSync(
    resolve(root, "tests/fixtures/identity/mas-zemamra-catalog-reads-2026-10-03.json"),
    "utf8",
  ),
) as { wide: { ext: string; wideMatches: { appPlayer: string }[] }[] };

describe("seven identified identities: the proposal items that would be sent", () => {
  test("one identity-only item each: the candidate, the one canonical player, basis manual, no evidence refs", () => {
    expect(plan.identified.map((i) => i.sofascoreExternalId)).toEqual(
      ["1096751", "1140961", "1182110", "1525325", "1919299", "544156", "919340"].sort(
        (a, b) => Number(a) - Number(b),
      ),
    );
    for (const i of plan.identified) {
      expect(Object.keys(i.proposalItem).sort()).toEqual([
        "appPlayerId",
        "basis",
        "kind",
        "sofascoreCandidateId",
      ]);
      expect(i.proposalItem.kind).toBe("map");
      expect(i.proposalItem.basis).toBe("manual");
      const read = catalogue.wide.find((w) => w.ext === i.sofascoreExternalId);
      expect(read?.wideMatches.map((m) => m.appPlayer)).toEqual([i.proposalItem.appPlayerId]);
    }
    expect(new Set(plan.identified.map((i) => i.proposalItem.appPlayerId)).size).toBe(7);
    expect(new Set(plan.identified.map((i) => i.proposalItem.sofascoreCandidateId)).size).toBe(7);
  });

  test("five need the position note and acknowledgement; two differ by shirt only", () => {
    const notes = plan.identified.filter((i) => i.needsPositionNoteAndAcknowledgement);
    expect(notes.map((i) => i.sofascoreExternalId).sort()).toEqual([
      "1096751",
      "1140961",
      "1525325",
      "1919299",
      "544156",
    ]);
    for (const i of notes) {
      expect(i.discrepancy.kind).toBe("position");
      expect(i.discrepancy.providerLetter).toBe("M");
      expect(i.discrepancy.catalogueLetter).toBe("F");
    }
    const shirt = plan.identified.filter((i) => !i.needsPositionNoteAndAcknowledgement);
    expect(shirt.map((i) => i.sofascoreExternalId).sort()).toEqual(["1182110", "919340"]);
    for (const i of shirt) expect(i.discrepancy.kind).toBe("shirt");
  });

  test("the link preserves what the Fantasy game holds: the before-state is read, and 1140961 sits in a locked squad", () => {
    for (const i of plan.identified) {
      expect(i.statement).toContain("moves no player's Fantasy club, position, price");
      expect(i.beforeLink.fantasy?.footballTeamId).toBeTruthy();
      expect(i.beforeLink.fantasy?.price).toBeTruthy();
      expect(i.beforeLink.gw1ProvisionalPointsSum).toBe(0);
      expect(i.beforeLink.performanceRowsForThisFixture).toBe(0);
    }
    const locked = plan.identified.filter((i) => i.beforeLink.lockedLineupsHoldingHim > 0);
    expect(locked.map((i) => i.sofascoreExternalId)).toEqual(["1140961"]);
    expect(locked[0]?.beforeLink.squadsHoldingHim).toBe(3);
    expect(locked[0]?.beforeLink.lockedLineupsHoldingHim).toBe(2);
  });

  test("the second provider's match lineup puts each of them at the same club with the same match shirt", () => {
    for (const i of plan.identified) {
      expect(i.smCorroboration).toEqual({
        smMatchLineupSameClub: true,
        smMatchShirtEqualsSofascoreMatchShirt: true,
        smSameCanonicalPlayerViaEstablishedMapping: true,
      });
    }
  });
});

describe("the two ids with no candidate record", () => {
  test("the missing row and the canonical target are reported apart; neither target is proof", () => {
    const [gk, def] = plan.missing;
    expect(plan.missing.map((m) => m.workflowRow)).toEqual([
      "CANDIDATE_RECORD_MISSING",
      "CANDIDATE_RECORD_MISSING",
    ]);
    // Both are listed under a different Sofascore club than the one they played for.
    expect(gk?.sofascoreLineup.providerTeamIdIsTheMatchClub).toBe(false);
    expect(def?.sofascoreLineup.providerTeamIdIsTheMatchClub).toBe(false);
    expect(gk?.canonicalTarget.confidence).toBe("MEDIUM");
    expect(gk?.canonicalTarget.canBeCheckedByDate).toBe(true);
    expect(def?.canonicalTarget.confidence).toBe("LOW");
    expect(def?.canonicalTarget.canBeCheckedByDate).toBe(false);
    for (const m of plan.missing) expect(m.canonicalTarget.basis).toContain("not proof");
    expect(gk?.canonicalTarget.hypothesisAppPlayerId).not.toBe(
      def?.canonicalTarget.hypothesisAppPlayerId,
    );
  });
});

describe("classes: nothing moves without an independent source", () => {
  test("the current classes are the ones of the resolution document", () => {
    expect(plan.byCurrentClass).toEqual({
      MAPPING_EVIDENCE_INSUFFICIENT: 11,
      EXISTING_CANONICAL_PLAYER_IDENTIFIED: 7,
      MEMBERSHIP_CORRECTION_NEEDED: 2,
      CANDIDATE_RECORD_MISSING: 2,
    });
    expect(plan.classes).toHaveLength(22);
  });

  test("five classes are supported to change, each with a named independent source; the rest stay", () => {
    expect(plan.changedClasses).toEqual(["1525293", "1528418", "1939981", "2150417", "2776292"]);
    for (const c of plan.classes) {
      expect(c.changed).toBe(c.independentSource !== null);
      if (c.changed) expect(c.supportedClass).not.toBe(c.currentClass);
      else expect(c.supportedClass).toBe(c.currentClass);
    }
    const supported = (id: string) => plan.classes.find((c) => c.externalId === id)?.supportedClass;
    expect(supported("2150417")).toBe("EXISTING_CANONICAL_PLAYER_IDENTIFIED");
    expect(supported("1528418")).toBe("MEMBERSHIP_CORRECTION_NEEDED");
    expect(supported("1939981")).toBe("MEMBERSHIP_CORRECTION_NEEDED");
    expect(supported("1525293")).toBe("OTHER_ATTRIBUTE_CONFLICT");
    expect(supported("2776292")).toBe("CANONICAL_PLAYER_NOT_FOUND");
  });

  test("the membership questions, the shared date and the placeholder dates stay where they were", () => {
    for (const id of ["1213241", "2161842", "2776291", "1004523", "2790099", "919753", "1866448"]) {
      expect(plan.classes.find((c) => c.externalId === id)?.changed).toBe(false);
    }
    // Three insufficient identities have no independent source at all.
    for (const id of ["1894253", "1919276", "2790119"]) {
      const c = plan.classes.find((x) => x.externalId === id);
      expect(c?.changed).toBe(false);
      expect(c?.targetAppPlayerId).toBeNull();
    }
  });

  test("every supported change shares the match shirt with the SM lineup slot", () => {
    for (const id of plan.changedClasses) {
      expect(plan.classes.find((x) => x.externalId === id)?.smSlot?.sameMatchShirt).toBe(true);
    }
  });

  const hit = (over: Partial<SmHit> = {}): SmHit => ({
    smId: "1",
    appPlayerId: "p",
    vsCatalogue: "catalogue_null",
    smTeam: "F",
    matchesSmLatest: true,
    ...over,
  });
  const run = (hits: SmHit[], same = 1) =>
    assessClass({
      externalId: "x",
      currentClass: "MAPPING_EVIDENCE_INSUFFICIENT",
      currentCode: "APP_DOB_MISSING_FOR_POSSIBLE_TARGETS",
      currentTarget: null,
      hits,
      nSofascoreSameDate: same,
      poolClubOfCanonical: () => "F",
    });

  test("a collision in either direction, or an older SM value, supports nothing", () => {
    expect(run([hit()]).changed).toBe(true);
    expect(run([hit(), hit({ smId: "2" })]).changed).toBe(false);
    expect(run([hit()], 2).changed).toBe(false);
    expect(run([hit({ vsCatalogue: "differs", matchesSmLatest: false })]).changed).toBe(false);
    expect(run([hit({ vsCatalogue: "equal" })]).changed).toBe(false);
    expect(run([]).changed).toBe(false);
  });

  test("the club the SM lineup names decides identified versus membership question", () => {
    expect(run([hit({ smTeam: "F" })]).supportedClass).toBe("EXISTING_CANONICAL_PLAYER_IDENTIFIED");
    expect(run([hit({ smTeam: "Z" })]).supportedClass).toBe("MEMBERSHIP_CORRECTION_NEEDED");
  });
});

describe("the twelve club players with no usable catalogue date", () => {
  test("twelve, four with an independently anchored date, eight with none; the date itself is never stated", () => {
    expect(plan.pool).toHaveLength(12);
    expect(plan.poolWithAvailableDate).toBe(4);
    expect(plan.poolWithoutAnySource).toBe(8);
    for (const p of plan.pool) {
      expect(["none available", "available:sportsmonks-current-player-list-observation"]).toContain(
        p.proposedValueStatus,
      );
      expect(p.onlyAvailableDateIsATentativeSofascoreMatch).toBe(false);
    }
    const unlocked = plan.pool.flatMap((p) => p.unlocksSofascoreIdsInThisMatch).sort();
    expect(unlocked).toEqual(["1528418", "2150417"]);
  });
});

describe("no name and no date of birth reaches the output", () => {
  const names = new Set<string>();
  const dir = resolve(root, "tests/fixtures/providers/sofascore");
  type Side = { players: { player: { name?: string; shortName?: string } }[] };
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".lineups.json"))) {
    const data = JSON.parse(readFileSync(resolve(dir, file), "utf8")) as { home: Side; away: Side };
    for (const side of [data.home, data.away])
      for (const p of side.players) {
        if ((p.player.name ?? "").length >= 5) names.add(p.player.name as string);
        if ((p.player.shortName ?? "").length >= 5) names.add(p.player.shortName as string);
      }
  }
  const outputs = {
    plan: JSON.stringify(plan),
    reads: readFileSync(
      resolve(root, "tests/fixtures/identity/mas-zemamra-evidence-reads-2026-10-03.json"),
      "utf8",
    ),
  };
  test("no player name appears", () => {
    expect(names.size).toBeGreaterThan(100);
    for (const [label, text] of Object.entries(outputs))
      for (const name of names) if (text.includes(name)) throw new Error(`${label} holds a name`);
  });
  test("no date appears except the read timestamp", () => {
    for (const [label, text] of Object.entries(outputs)) {
      const dates = (text.match(/\d{4}-\d{2}-\d{2}/g) ?? []).filter((d) => d !== "2026-10-03");
      expect({ label, dates }).toEqual({ label, dates: [] });
    }
  });
});
