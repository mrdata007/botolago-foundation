import { describe, expect, test } from "bun:test";
import {
  classifyCandidate,
  selectBulkBatch,
  type CandidateFacts,
  type OptionFacts,
} from "./eligibility";
import {
  PRODUCTION_SHAPE,
  buildWorld,
  factsOf,
  newRepo,
  oracleManifest,
  candidateUuid,
} from "./test-world";

const option = (over: Partial<OptionFacts> = {}): OptionFacts => ({
  appPlayerId: "p1",
  dob: "match",
  shirt: "match",
  position: "match",
  club: "match",
  flags: [],
  ownedBySofascore: false,
  sportsMonksActive: true,
  ...over,
});
const facts = (over: Partial<CandidateFacts> = {}): CandidateFacts => ({
  candidateId: "c1",
  provider: "sofascore",
  externalId: "S1",
  status: "unmapped",
  hasExistingMapping: false,
  providerIdMapped: false,
  openProposal: false,
  evidenceRevision: 1,
  observationCount: 1,
  appTeamId: "t1",
  squadComplete: true,
  registeredTeamDisagreement: false,
  providerDobState: "valid",
  providerDobJanuary1: false,
  independentBridge: false,
  options: [option()],
  ...over,
});

describe("the frozen eligibility contract", () => {
  test("a fully corroborated candidate is Tier A; no shirt signal is Tier B", () => {
    expect(classifyCandidate(facts())).toMatchObject({ bucket: "AUTO_BATCH_ELIGIBLE", tier: "A" });
    expect(classifyCandidate(facts({ options: [option({ shirt: "no_signal" })] }))).toMatchObject({
      bucket: "AUTO_BATCH_ELIGIBLE",
      tier: "B",
    });
  });

  test("a shirt CONFLICT is never Tier B and never eligible", () => {
    expect(classifyCandidate(facts({ options: [option({ shirt: "conflict" })] }))).toMatchObject({
      bucket: "CONFLICT",
      reason: "SHIRT_CONFLICT",
    });
  });

  test("both tiers need the SportsMonks identity on the same canonical player", () => {
    for (const shirt of ["match", "no_signal"] as const)
      expect(
        classifyCandidate(facts({ options: [option({ shirt, sportsMonksActive: false })] })),
      ).toMatchObject({ bucket: "INSUFFICIENT_EVIDENCE", reason: "NO_SPORTSMONKS_CORROBORATION" });
  });

  test("an incomplete squad never qualifies, even with one perfect option (absence is not evidence)", () => {
    expect(classifyCandidate(facts({ squadComplete: false }))).toMatchObject({
      bucket: "INCOMPLETE_PROVIDER_DATA",
      reason: "INCOMPLETE_PROVIDER_SQUAD",
    });
  });

  test("a January-1 / placeholder date never qualifies as birth-date evidence", () => {
    expect(classifyCandidate(facts({ providerDobJanuary1: true }))).toMatchObject({
      bucket: "INCOMPLETE_PROVIDER_DATA",
      reason: "PROVIDER_DOB_PLACEHOLDER",
    });
    // An app-side placeholder reaches the contract as NO SIGNAL, which is not a match.
    expect(classifyCandidate(facts({ options: [option({ dob: "no_signal" })] }))).toMatchObject({
      bucket: "INSUFFICIENT_EVIDENCE",
      reason: "NO_EXACT_DOB_MATCH_IN_CLUB",
    });
  });

  test.each([
    ["more than one squad", { observationCount: 2 }, "AMBIGUOUS", "MULTI_SQUAD_OBSERVATION"],
    [
      "registered-team disagreement",
      { registeredTeamDisagreement: true },
      "CONFLICT",
      "REGISTERED_TEAM_DISAGREEMENT",
    ],
    ["an open proposal", { openProposal: true }, "HELD", "STATUS_OR_OPEN_PROPOSAL"],
    [
      "a mapped provider id",
      { providerIdMapped: true },
      "ALREADY_MAPPED",
      "PROVIDER_ID_ALREADY_MAPPED",
    ],
    ["no club context", { appTeamId: null }, "INCOMPLETE_PROVIDER_DATA", "NO_CLUB_CONTEXT"],
    [
      "an invalid provider date",
      { providerDobState: "invalid" },
      "INCOMPLETE_PROVIDER_DATA",
      "PROVIDER_DOB_NOT_VALID",
    ],
  ] as const)("%s is never eligible", (_label, over, bucket, reason) => {
    expect(classifyCandidate(facts(over as Partial<CandidateFacts>))).toMatchObject({
      bucket,
      reason,
    });
  });

  test("two exact-date players in the club are AMBIGUOUS, not a coin flip", () => {
    expect(
      classifyCandidate(
        facts({ options: [option({ appPlayerId: "p1" }), option({ appPlayerId: "p2" })] }),
      ),
    ).toMatchObject({ bucket: "AMBIGUOUS", reason: "MULTIPLE_EXACT_DOB_TARGETS" });
  });

  test("a target already held by a Sofascore mapping, a position conflict or a flag is a CONFLICT", () => {
    for (const [over, reason] of [
      [{ ownedBySofascore: true }, "TARGET_ALREADY_MAPPED_SOFASCORE"],
      [{ position: "conflict" as const }, "POSITION_DISAGREEMENT"],
      [{ flags: ["DOB_CONFLICT"] }, "SIGNAL_FLAGS"],
    ] as const)
      expect(classifyCandidate(facts({ options: [option(over)] }))).toMatchObject({
        bucket: "CONFLICT",
        reason,
      });
  });

  test("Flashscore stays out without an independent bridge, and no bridge is built in this batch", () => {
    expect(classifyCandidate(facts({ provider: "flashscore", options: [option()] }))).toMatchObject(
      {
        bucket: "INSUFFICIENT_EVIDENCE",
        reason: "FLASHSCORE_NO_INDEPENDENT_BRIDGE",
      },
    );
    // Even WITH a bridge it is not part of this batch.
    expect(
      classifyCandidate(facts({ provider: "flashscore", independentBridge: true })).bucket,
    ).not.toBe("AUTO_BATCH_ELIGIBLE");
  });
});

describe("the collision gate removes EVERY involved row and picks no winner", () => {
  const a = facts({
    candidateId: "ca",
    externalId: "SA",
    options: [option({ appPlayerId: "same" })],
  });
  const b = facts({
    candidateId: "cb",
    externalId: "SB",
    options: [option({ appPlayerId: "same" })],
  });
  const c = facts({
    candidateId: "cc",
    externalId: "SC",
    options: [option({ appPlayerId: "other" })],
  });

  test("two candidates for one app player both leave the batch", () => {
    const out = selectBulkBatch([a, b, c]);
    expect(out.eligible.map((e) => e.candidateId)).toEqual(["cc"]);
    expect(out.collisions).toMatchObject({ duplicateTargets: 1, rowsRemoved: 2 });
    expect(out.classifications.filter((x) => x.reason === "COLLISION_REMOVED").length).toBe(2);
    expect(out.counts.CONFLICT).toBe(2);
  });

  test("one provider id on two candidates, and one candidate listed twice, both leave the batch", () => {
    const dupId = selectBulkBatch([
      facts({ candidateId: "x1", externalId: "SX", options: [option({ appPlayerId: "p-x1" })] }),
      facts({ candidateId: "x2", externalId: "SX", options: [option({ appPlayerId: "p-x2" })] }),
    ]);
    expect(dupId.eligible).toHaveLength(0);
    expect(dupId.collisions.duplicateProviderIds).toBe(1);
    const twice = selectBulkBatch([a, { ...a, options: [option({ appPlayerId: "p-other" })] }]);
    expect(twice.eligible).toHaveLength(0);
    expect(twice.collisions.duplicateCandidates).toBe(1);
  });
});

describe("a 1,004-candidate, production-shaped population", () => {
  const world = buildWorld(PRODUCTION_SHAPE);

  test("the population is production-sized", () => {
    expect(world.candidates.length).toBe(1004);
  });

  test("selects exactly 189: 108 Tier A and 81 Tier B, and nothing else", async () => {
    const out = selectBulkBatch(await factsOf(newRepo(world)));
    expect(out.eligible).toHaveLength(189);
    expect(out.eligible.filter((e) => e.tier === "A")).toHaveLength(108);
    expect(out.eligible.filter((e) => e.tier === "B")).toHaveLength(81);
    expect(new Set(out.eligible.map((e) => e.candidateId))).toEqual(
      new Set(world.eligible.map((e) => candidateUuid(e.index))),
    );
    expect(out.collisions.rowsRemoved).toBe(0);
    expect(out.counts).toMatchObject({
      AUTO_BATCH_ELIGIBLE: 189,
      AMBIGUOUS: 2,
      ALREADY_MAPPED: 0,
      HELD: 0,
    });
    // Every Flashscore candidate is insufficient evidence; none is eligible.
    expect(
      out.classifications.filter((c) => c.reason === "FLASHSCORE_NO_INDEPENDENT_BRIDGE"),
    ).toHaveLength(465);
    expect(out.classifications.filter((c) => c.reason === "PROVIDER_DOB_PLACEHOLDER")).toHaveLength(
      36,
    );
    expect(
      out.classifications.filter((c) => c.reason === "INCOMPLETE_PROVIDER_SQUAD"),
    ).toHaveLength(10);
    // A shirt conflict also raises the shirt-difference flag, so it is a CONFLICT either way.
    expect(
      out.classifications.filter((c) => c.bucket === "CONFLICT" && c.reason === "SIGNAL_FLAGS"),
    ).toHaveLength(6);
    // An app-side January-1 date is no match, so those six are "no exact date", not eligible.
    expect(out.classifications.filter((c) => c.bucket === "AUTO_BATCH_ELIGIBLE").length).toBe(189);
  });
});

describe("NAMES NEGATIVE CONTROL: names never affect selection, tier, target, hash or fingerprint", () => {
  test("renaming every provider and app player changes nothing that decides", async () => {
    const plain = buildWorld({ ...PRODUCTION_SHAPE, names: "plain" });
    const scrambled = buildWorld({ ...PRODUCTION_SHAPE, names: "scrambled" });
    // The names really are different...
    expect(plain.candidates[0]!.displayName).not.toBe(scrambled.candidates[0]!.displayName);
    expect(plain.appPlayers[0]!.displayName).not.toBe(scrambled.appPlayers[0]!.displayName);

    const a = selectBulkBatch(await factsOf(newRepo(plain)));
    const b = selectBulkBatch(await factsOf(newRepo(scrambled)));
    // ...and the selection, the targets and the tiers are identical.
    expect(b.classifications).toEqual(a.classifications);
    expect(b.eligible).toEqual(a.eligible);

    // So is the frozen manifest: same hash, same proposal fingerprints.
    const ma = await oracleManifest(plain);
    const mb = await oracleManifest(scrambled);
    expect(mb.manifestSha256).toBe(ma.manifestSha256);
    expect(mb.rows.map((r) => r.expectedFingerprint)).toEqual(
      ma.rows.map((r) => r.expectedFingerprint),
    );
  });

  test("two players swapping names do not swap targets", async () => {
    const world = buildWorld({ tierA: 4, tierB: 0, flashscore: 0 });
    const swapped = {
      ...world,
      appPlayers: world.appPlayers.map((p, i, all) => ({
        ...p,
        displayName: all[(i + 1) % all.length]!.displayName,
      })),
    };
    const a = selectBulkBatch(await factsOf(newRepo(world)));
    const b = selectBulkBatch(await factsOf(newRepo(swapped)));
    expect(b.eligible.map((e) => [e.candidateId, e.targetAppPlayerId])).toEqual(
      a.eligible.map((e) => [e.candidateId, e.targetAppPlayerId]),
    );
  });
});
