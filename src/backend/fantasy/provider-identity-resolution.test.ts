import { describe, expect, test } from "bun:test";
import {
  resolveSofascoreIdentity,
  type CatalogMatch,
  type CatalogRead,
  type PoolPlayer,
} from "./provider-identity-resolution";
import type { SofaCandidateRow } from "./provider-identity-worklist";

const TEAM = "team-1";
const candidate = (patch: Partial<SofaCandidateRow> = {}): SofaCandidateRow => ({
  candidateId: "c1",
  externalId: "S1",
  status: "unmapped",
  rev: 2,
  nObs: 1,
  club: "club-a",
  complete: "COMPLETE",
  regDisagree: false,
  dobState: "valid",
  dobJan1: false,
  openProposal: false,
  extMapped: false,
  nOpts: 20,
  dobMatches: 1,
  target: "p1",
  targetSignals: { club: "match", position: "match", shirt: "match", flags: [] },
  targetSmActive: true,
  targetSofaMapped: false,
  targetFlashMapped: false,
  ...patch,
});
const match = (patch: Partial<CatalogMatch> = {}): CatalogMatch => ({
  appPlayer: "p1",
  active: true,
  pos: "M",
  sameClubActive: true,
  sameClubEver: true,
  otherActiveClubs: 0,
  inactiveMemberships: 0,
  sofaMapped: false,
  flashMapped: false,
  smActive: true,
  inFantasyCatalog: true,
  inLockedSquad: false,
  ...patch,
});
const read = (matches: CatalogMatch[], patch: Partial<CatalogRead> = {}): CatalogRead => ({
  ext: "S1",
  team: TEAM,
  club: "club-a",
  dobState: "valid",
  jan1: false,
  obsShirt: 7,
  obsPos: "M",
  wideMatches: matches,
  clubActive: 25,
  clubNullDob: 0,
  clubJan1Dob: 0,
  ...patch,
});
const pool = (n: number, dob: PoolPlayer["dob"] = "null", pos = "M"): PoolPlayer[] =>
  Array.from({ length: n }, (_, i) => ({
    team: TEAM,
    p: `pool-${i}`,
    pos,
    dob,
    shirts: null,
    sm: false,
    fantasy: false,
    locked: false,
  }));
const run = (c: SofaCandidateRow | null, r: CatalogRead | null, p: PoolPlayer[] = []) =>
  resolveSofascoreIdentity({
    externalId: "S1",
    candidate: c,
    read: r,
    pool: p,
    lineupPosition: "M",
    lineupClubTeam: TEAM,
  });

describe("resolving a Sofascore identity against the whole catalogue", () => {
  test("one exact date of birth, same club, nothing disagreeing: identified, high confidence", () => {
    const r = run(candidate(), read([match()]));
    expect(r.classification).toBe("EXISTING_CANONICAL_PLAYER_IDENTIFIED");
    expect(r.targetAppPlayerId).toBe("p1");
    expect(r.identityConfidence).toBe("HIGH");
    expect(r.attributeConflicts).toEqual([]);
    expect(r.missingEvidence).toEqual([]);
  });

  test("a position or shirt difference is metadata: the identity stays HIGH and the conflict is named, never corrected", () => {
    const position = run(
      candidate({ targetSignals: { position: "conflict", club: "match" } }),
      read([match()]),
    );
    expect(position.classification).toBe("EXISTING_CANONICAL_PLAYER_IDENTIFIED");
    expect(position.attributeConflicts).toEqual(["position"]);
    expect(position.notes.join(" ")).toMatch(/note and an explicit acknowledgement/);
    const shirt = run(
      candidate({ targetSignals: { shirt: "conflict", position: "match" } }),
      read([match()]),
    );
    expect(shirt.attributeConflicts).toEqual(["shirt"]);
    expect(shirt.identityConfidence).toBe("HIGH");
    for (const r of [position, shirt])
      expect(r.notes.join(" ")).toMatch(
        /would not move the player's club, position, price, locked-lineup association or historical scoring/,
      );
  });

  test("several attributes disagreeing, or no independent identity, is not enough on its own", () => {
    const both = run(
      candidate({ targetSignals: { position: "conflict", shirt: "conflict" } }),
      read([match()]),
    );
    expect(both.classification).toBe("OTHER_ATTRIBUTE_CONFLICT");
    expect(both.identityConfidence).toBe("NONE");
    const noSm = run(candidate(), read([match({ smActive: false })]));
    expect(noSm.classification).toBe("OTHER_ATTRIBUTE_CONFLICT");
    expect(noSm.code).toBe("NO_INDEPENDENT_IDENTITY_CORROBORATION");
  });

  test("the same date of birth at ANOTHER club is a membership question, never a silent club change", () => {
    const r = run(
      candidate(),
      read([
        match({
          sameClubActive: false,
          sameClubEver: false,
          otherActiveClubs: 1,
          inLockedSquad: true,
        }),
      ]),
    );
    expect(r.classification).toBe("MEMBERSHIP_CORRECTION_NEEDED");
    expect(r.code).toBe("CATALOGUE_PLACES_HIM_AT_ANOTHER_CLUB");
    expect(r.identityConfidence).toBe("NONE");
    expect(r.missingEvidence.join(" ")).toMatch(/Dated evidence/);
    expect(r.notes.join(" ")).toMatch(/locked Fantasy squad: nothing here may move him/);
  });

  test("a player with no active membership anywhere is also a membership question", () => {
    const r = run(
      candidate(),
      read([match({ sameClubActive: false, otherActiveClubs: 0, inFantasyCatalog: false })]),
    );
    expect(r.code).toBe("CATALOGUE_HAS_NO_ACTIVE_MEMBERSHIP");
    expect(r.classification).toBe("MEMBERSHIP_CORRECTION_NEEDED");
  });

  test("the date matches a player who already has another Sofascore id: never a duplicate, never a guess", () => {
    const r = run(candidate(), read([match({ sofaMapped: true })]));
    expect(r.classification).toBe("MAPPING_EVIDENCE_INSUFFICIENT");
    expect(r.code).toBe("TARGET_ALREADY_REPRESENTED");
    expect(r.targetAppPlayerId).toBeNull();
    const two = run(candidate(), read([match(), match({ appPlayer: "p2" })]));
    expect(two.code).toBe("AMBIGUOUS_EXACT_DOB");
    expect(two.targetAppPlayerId).toBeNull();
  });

  test("no exact date anywhere: INSUFFICIENT while club players lack a date, NOT FOUND only when none can be the one", () => {
    const missing = run(candidate(), read([]), pool(2, "null"));
    expect(missing.classification).toBe("MAPPING_EVIDENCE_INSUFFICIENT");
    expect(missing.code).toBe("APP_DOB_MISSING_FOR_POSSIBLE_TARGETS");
    expect(missing.possibleTargetsWithMissingDob).toBe(2);
    expect(missing.targetAppPlayerId).toBeNull();
    const none = run(candidate(), read([]), pool(2, "set"));
    expect(none.classification).toBe("CANONICAL_PLAYER_NOT_FOUND");
    expect(none.missingEvidence.join(" ")).toMatch(/Not found by this matcher/);
    expect(none.missingEvidence.join(" ")).toMatch(/does not show he does not exist/);
    // A pool player of another position cannot be the one.
    expect(run(candidate(), read([]), pool(3, "null", "G")).classification).toBe(
      "CANONICAL_PLAYER_NOT_FOUND",
    );
  });

  test("a missing or placeholder provider date cannot search the catalogue at all", () => {
    expect(run(candidate({ dobJan1: true }), read([])).code).toBe("PROVIDER_DOB_UNUSABLE");
    expect(run(candidate({ dobState: "missing" }), read([])).classification).toBe(
      "MAPPING_EVIDENCE_INSUFFICIENT",
    );
  });

  test("no candidate record is a missing workflow record, not a missing canonical player", () => {
    const r = run(null, null, pool(3, "set"));
    expect(r.classification).toBe("CANDIDATE_RECORD_MISSING");
    expect(r.targetAppPlayerId).toBeNull();
    expect(r.missingEvidence.join(" ")).toMatch(/candidate record/);
    expect(r.notes.join(" ")).toMatch(/not a finding that no canonical player exists/);
  });

  test("it never reads a name: the inputs have none, and no result is a guess among several", () => {
    for (const r of [
      run(candidate(), read([match()])),
      run(candidate(), read([match(), match({ appPlayer: "p2" })])),
      run(null, null),
    ]) {
      expect(JSON.stringify(r)).not.toMatch(/displayName|fullName/);
      if (
        r.classification !== "EXISTING_CANONICAL_PLAYER_IDENTIFIED" &&
        r.classification !== "MEMBERSHIP_CORRECTION_NEEDED"
      )
        expect(r.targetAppPlayerId).toBeNull();
    }
  });
});
