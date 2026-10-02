import { describe, expect, test } from "bun:test";
import type { RepositoryContext } from "@/backend/contracts/repository";
import {
  CANDIDATE_PAGE_SIZE,
  ALL,
  NO_FILTERS,
  classifyPreview,
  clubContexts,
  clubFacets,
  countByStatus,
  dualControlFor,
  evidenceStrength,
  filterCandidates,
  heldProposals,
  loadAllCandidates,
  loadAllProposals,
  loadOptions,
  mapWithConcurrency,
  nextRowIndex,
  observedAppTeamIds,
  orderCandidates,
  plausibleOptionCount,
  readOptionSignals,
  summarizeCandidate,
  waitingForSecondReviewer,
} from "./review-queue";
import type {
  AppPlayerOption,
  CandidateDto,
  ProposalDto,
  ReviewerAvailability,
} from "./mapping-contracts";
import type { PlayerMappingRepository } from "./mapping-repository";
import { InMemoryPlayerMappingRepository, type MockSeedCandidate } from "./mock-mapping-repository";
import {
  PRODUCTION_SCALE,
  SAMPLE_ACTORS,
  buildSampleWorld,
  sampleUuid,
} from "./sample-mapping-data";

const ctx = (actorId: string): RepositoryContext => ({ actorId, requestId: "test" });
const proposer = ctx(SAMPLE_ACTORS.proposer);
const approver = ctx(SAMPLE_ACTORS.approver);

describe("paging at production scale", () => {
  const world = buildSampleWorld();
  const total = PRODUCTION_SCALE.sofascore + PRODUCTION_SCALE.flashscore;

  test("the sample is the size production is: 1,004 candidates", () => {
    expect(total).toBe(1004);
    expect(world.repository.candidateCount()).toBe(1004);
  });

  test("reads all 1,004 in six pages, each after the last id, without a repeat", async () => {
    let calls = 0;
    const spy: PlayerMappingRepository = new Proxy(world.repository, {
      get(target, property, receiver) {
        if (property === "listMappingCandidates")
          return (...args: Parameters<PlayerMappingRepository["listMappingCandidates"]>) => {
            calls += 1;
            expect(args[2]).toBe(CANDIDATE_PAGE_SIZE);
            return target.listMappingCandidates(...args);
          };
        return Reflect.get(target, property, receiver);
      },
    });
    const loaded: number[] = [];
    const all = await loadAllCandidates(spy, {}, proposer, { onPage: (n) => loaded.push(n) });
    expect(all).toHaveLength(1004);
    expect(new Set(all.map((c) => c.id)).size).toBe(1004);
    expect(calls).toBe(6);
    expect(loaded).toEqual([200, 400, 600, 800, 1000, 1004]);
    const ids = all.map((c) => c.id);
    expect(ids).toEqual([...ids].sort());
  });

  test("provider split matches production: 539 Sofascore, 465 Flashscore", async () => {
    const sofa = await loadAllCandidates(world.repository, { provider: "sofascore" }, proposer);
    const flash = await loadAllCandidates(world.repository, { provider: "flashscore" }, proposer);
    expect([sofa.length, flash.length]).toEqual([539, 465]);
  });

  test("a page size that divides the total evenly still ends (exactly 400)", async () => {
    const small = buildSampleWorld({ sofascore: 250, flashscore: 150 });
    expect(await loadAllCandidates(small.repository, {}, proposer)).toHaveLength(400);
  });

  test("a cursor that never advances is reported, not looped on", async () => {
    const page = (await world.repository.listMappingCandidates({}, null, 200, proposer)).slice();
    const stuck = {
      listMappingCandidates: async () => page,
    } as unknown as PlayerMappingRepository;
    await expect(loadAllCandidates(stuck, {}, proposer)).rejects.toMatchObject({
      code: "mapping_unavailable",
    });
  });

  test("proposals page the same way", async () => {
    expect(await loadAllProposals(world.repository, null, proposer)).toEqual([]);
  });
});

describe("candidate flags and what the screen shows", () => {
  const world = buildSampleWorld();
  let all: CandidateDto[] = [];

  test("loads", async () => {
    all = await loadAllCandidates(world.repository, {}, proposer);
  });

  test("exactly two candidates sit in two squads, and both show MULTI_SQUAD_OBSERVATION", () => {
    const multi = filterCandidates(all, { ...NO_FILTERS, flag: "MULTI_SQUAD_OBSERVATION" });
    expect(multi).toHaveLength(2);
    for (const candidate of multi) {
      expect(candidate.observations).toHaveLength(2);
      expect(clubContexts(candidate)).toHaveLength(2);
      expect(observedAppTeamIds(candidate)).toHaveLength(2);
    }
    expect(all.filter((c) => c.observations.length > 1)).toHaveLength(2);
  });

  test("Widad Témara's Flashscore candidates all show INCOMPLETE_PROVIDER_SQUAD, nobody else does", () => {
    const incomplete = filterCandidates(all, { ...NO_FILTERS, flag: "INCOMPLETE_PROVIDER_SQUAD" });
    expect(incomplete.length).toBeGreaterThan(0);
    for (const candidate of incomplete) {
      expect(candidate.provider).toBe("flashscore");
      expect(clubContexts(candidate).map((c) => c.clubKey)).toEqual(["widad-temara"]);
    }
    const widadFlash = filterCandidates(all, {
      ...NO_FILTERS,
      club: "widad-temara",
      provider: "flashscore",
    });
    expect(widadFlash).toHaveLength(incomplete.length);
  });

  test("REGISTERED_TEAM_DISAGREEMENT is a filter, from the observations", () => {
    const flagged = filterCandidates(all, { ...NO_FILTERS, flag: "REGISTERED_TEAM_DISAGREEMENT" });
    expect(flagged.length).toBeGreaterThan(0);
    for (const candidate of flagged)
      expect(candidate.observations.some((o) => o.registeredTeamDisagreement)).toBe(true);
  });

  test("filters combine (club, provider, status, evidence) and 'all' lets everything through", () => {
    expect(filterCandidates(all, NO_FILTERS)).toHaveLength(1004);
    const club = world.clubKeys[3]!;
    const some = filterCandidates(all, {
      ...NO_FILTERS,
      club,
      provider: "sofascore",
      status: "unmapped",
      evidence: ALL,
    });
    expect(some.length).toBeGreaterThan(0);
    for (const c of some) {
      expect(c.provider).toBe("sofascore");
      expect(clubContexts(c).some((x) => x.clubKey === club)).toBe(true);
    }
    expect(filterCandidates(all, { ...NO_FILTERS, status: "mapped" })).toEqual([]);
  });

  test("Flashscore carries no date of birth, so it can never be 'rich' evidence", () => {
    for (const c of all.filter((x) => x.provider === "flashscore"))
      expect(evidenceStrength(c)).not.toBe("rich");
    expect(all.some((c) => evidenceStrength(c) === "rich")).toBe(true);
  });

  test("a 1 January provider date does not count as usable evidence", () => {
    const base = all.find((c) => c.provider === "sofascore")!;
    const january = {
      observations: [
        {
          ...base.observations[0]!,
          dobState: "valid",
          dobJanuary1: true,
          shirtNumber: 7,
          position: "M" as const,
        },
      ],
    };
    expect(summarizeCandidate(january).hasUsableDob).toBe(false);
    expect(evidenceStrength(january)).toBe("partial");
  });

  test("the order is name-free: club, provider, provider id", () => {
    const ordered = orderCandidates(all);
    const renamed = orderCandidates(all.map((c, i) => ({ ...c, displayName: `Z${1000 - i}` })));
    expect(renamed.map((c) => c.id)).toEqual(ordered.map((c) => c.id));
  });

  test("a typed search filters on a name or a provider id, never reorders", () => {
    const sample = all[10]!;
    const byName = filterCandidates(all, {
      ...NO_FILTERS,
      search: sample.displayName!.toUpperCase(),
    });
    expect(byName.map((c) => c.id)).toContain(sample.id);
    const byId = filterCandidates(all, { ...NO_FILTERS, search: sample.externalId });
    expect(byId.map((c) => c.id)).toContain(sample.id);
    // accents fold: "Joueur" matches whatever the spelling
    expect(filterCandidates(all, { ...NO_FILTERS, search: "  éxémple  " }).length).toBe(1004);
  });

  test("facets and status counts add up", () => {
    expect(countByStatus(all)).toEqual({ unmapped: 1004, proposed: 0, mapped: 0, ignored: 0 });
    const facets = clubFacets(all);
    expect(facets).toHaveLength(16);
    // 1,004 candidates, plus one extra club each for the two two-squad candidates.
    expect(facets.reduce((sum, f) => sum + f.count, 0)).toBe(1006);
  });
});

describe("ranking is independent of names", () => {
  test("renaming every app player and every candidate leaves each score and order unchanged", async () => {
    const world = buildSampleWorld({ sofascore: 60, flashscore: 40 });
    const renamedCandidates: MockSeedCandidate[] = world.candidates.map((c, i) => ({
      ...c,
      displayName: `ZZZ ${9999 - i}`,
    }));
    const renamedPlayers = world.appPlayers.map((p, i) => ({
      ...p,
      displayName: `AAA ${9999 - i}`,
    }));
    const other = new InMemoryPlayerMappingRepository({
      candidates: renamedCandidates,
      appPlayers: renamedPlayers,
      qualifiedActors: [SAMPLE_ACTORS.proposer],
    });
    for (const candidate of world.candidates.slice(0, 25)) {
      const before = await world.repository.listMappingCandidatesForAppPlayer(
        candidate.id!,
        null,
        200,
        proposer,
      );
      const after = await other.listMappingCandidatesForAppPlayer(
        candidate.id!,
        null,
        200,
        proposer,
      );
      expect(after.map((o) => [o.appPlayerId, o.score])).toEqual(
        before.map((o) => [o.appPlayerId, o.score]),
      );
      expect(after.map((o) => o.signals)).toEqual(before.map((o) => o.signals));
    }
  });

  test("the screen's own logic never reads a name outside the typed search", async () => {
    const source = await Bun.file(new URL("./review-queue.ts", import.meta.url)).text();
    const reads = source
      .split("\n")
      .filter((line) => /displayName|\.name\b/.test(line) && !/^\s*(\/\/|\*|\/\*)/.test(line));
    // The search filter is the only code line that reads one.
    expect(reads.map((line) => line.trim())).toEqual([
      'fold(candidate.displayName ?? "").includes(needle) ||',
    ]);
  });
});

describe("options keep everyone and never penalise a missing value", () => {
  const world = buildSampleWorld({ sofascore: 80, flashscore: 60 });

  test("a position disagreement lowers the rank a little and is flagged, but nobody is hidden", async () => {
    let sawConflict = false;
    for (const candidate of world.candidates.slice(0, 40)) {
      const team = candidate.observations[0]!.appTeamId!;
      const options = await world.repository.listMappingCandidatesForAppPlayer(
        candidate.id!,
        team,
        200,
        proposer,
      );
      const roster = world.appPlayers.filter((p) => p.teamId === team);
      expect(options).toHaveLength(roster.length);
      expect(new Set(options.map((o) => o.appPlayerId))).toEqual(new Set(roster.map((p) => p.id)));
      for (const option of options) {
        const signals = readOptionSignals(option.signals);
        if (signals.position === "conflict") {
          sawConflict = true;
          expect(signals.flags).toContain("POSITION_DISAGREEMENT");
        }
      }
    }
    expect(sawConflict).toBe(true);
  });

  test("a player with nothing to compare scores zero, above one that conflicts", async () => {
    const team = sampleUuid("t", 1);
    const candidate: MockSeedCandidate = {
      id: sampleUuid("c", 1),
      provider: "sofascore",
      externalPlayerId: "1",
      flags: [],
      observations: [
        {
          provider: "sofascore",
          externalPlayerId: "1",
          providerTeamId: "10",
          clubKey: "amal-tiznit",
          appTeamId: team,
          squadCompleteness: "COMPLETE",
          registeredTeamId: null,
          registeredTeamDisagreement: false,
          shirtNumber: 9,
          positionSignal: "F",
          dobState: "valid",
          birthDate: "1999-05-14",
          dobJanuary1: false,
          heightCm: null,
          nationalitySignal: null,
        },
      ],
    };
    const repo = new InMemoryPlayerMappingRepository({
      candidates: [candidate],
      appPlayers: [
        {
          id: sampleUuid("a", 1),
          displayName: "Nothing",
          position: null,
          teamId: team,
          birthDate: null,
          shirtNumber: null,
        },
        {
          id: sampleUuid("a", 2),
          displayName: "Conflict",
          position: "G",
          teamId: team,
          birthDate: "1990-03-03",
          shirtNumber: 4,
        },
        {
          id: sampleUuid("a", 3),
          displayName: "Match",
          position: "F",
          teamId: team,
          birthDate: "1999-05-14",
          shirtNumber: 9,
        },
      ],
      qualifiedActors: [SAMPLE_ACTORS.proposer],
    });
    const options = await repo.listMappingCandidatesForAppPlayer(candidate.id!, team, 50, proposer);
    expect(options.map((o) => [o.appPlayerId, o.score])).toEqual([
      [sampleUuid("a", 3), 6],
      [sampleUuid("a", 1), 0],
      [sampleUuid("a", 2), -3],
    ]);
    const nothing = readOptionSignals(options[1]!.signals);
    expect([nothing.dob, nothing.shirt, nothing.position]).toEqual([
      "no_signal",
      "no_signal",
      "no_signal",
    ]);
  });

  test("a 1 January date of birth is no signal on either side, so it neither matches nor conflicts", async () => {
    const team = sampleUuid("t", 1);
    const observation = (birthDate: string, january1: boolean) => ({
      provider: "sofascore" as const,
      externalPlayerId: "1",
      providerTeamId: "10",
      clubKey: "amal-tiznit",
      appTeamId: team,
      squadCompleteness: "COMPLETE" as const,
      registeredTeamId: null,
      registeredTeamDisagreement: false,
      shirtNumber: null,
      positionSignal: null,
      dobState: "valid",
      birthDate,
      dobJanuary1: january1,
      heightCm: null,
      nationalitySignal: null,
    });
    const run = async (providerDob: [string, boolean], appDob: string) => {
      const candidate: MockSeedCandidate = {
        id: sampleUuid("c", 1),
        provider: "sofascore",
        externalPlayerId: "1",
        flags: [],
        observations: [observation(providerDob[0], providerDob[1])],
      };
      const repo = new InMemoryPlayerMappingRepository({
        candidates: [candidate],
        appPlayers: [
          {
            id: sampleUuid("a", 1),
            displayName: "x",
            position: null,
            teamId: team,
            birthDate: appDob,
          },
        ],
        qualifiedActors: [SAMPLE_ACTORS.proposer],
      });
      const [option] = await repo.listMappingCandidatesForAppPlayer(
        candidate.id!,
        team,
        5,
        proposer,
      );
      return { signals: readOptionSignals(option!.signals), score: option!.score };
    };
    // The app's date is on 1 January and equals the provider's: still no match.
    const appJan = await run(["1998-01-01", true], "1998-01-01");
    expect(appJan.signals.dob).toBe("no_signal");
    expect(appJan.signals.dobReason).toBe("app_january_first_low_confidence");
    expect(appJan.score).toBe(0);
    // The app's date is a different 1 January: no conflict either.
    expect((await run(["1999-06-06", false], "1998-01-01")).signals.dob).toBe("no_signal");
    // The provider's date is a 1 January: no signal, whatever the app holds.
    const providerJan = await run(["1998-01-01", true], "1997-03-04");
    expect(providerJan.signals.dob).toBe("no_signal");
    expect(providerJan.signals.dobReason).toBe("provider_january_first_low_confidence");
    // Control: two real dates do match, and differ.
    expect((await run(["1998-04-04", false], "1998-04-04")).signals.dob).toBe("match");
    expect((await run(["1998-04-04", false], "1997-04-04")).signals.dob).toBe("conflict");
  });

  test("an incomplete squad changes a flag and nothing else: same score with it or without", async () => {
    const team = sampleUuid("t", 1);
    const build = (completeness: "COMPLETE" | "INCOMPLETE_PROVIDER_SQUAD") => ({
      id: sampleUuid("c", 1),
      provider: "flashscore" as const,
      externalPlayerId: "1",
      flags: [],
      observations: [
        {
          provider: "flashscore" as const,
          externalPlayerId: "1",
          providerTeamId: "10",
          clubKey: "widad-temara",
          appTeamId: team,
          squadCompleteness: completeness,
          registeredTeamId: null,
          registeredTeamDisagreement: false,
          shirtNumber: 8,
          positionSignal: "M" as const,
          dobState: "not_provided",
          birthDate: null,
          dobJanuary1: false,
          heightCm: null,
          nationalitySignal: null,
        },
      ],
    });
    const players = [
      {
        id: sampleUuid("a", 1),
        displayName: "In",
        position: "M" as const,
        teamId: team,
        shirtNumber: 8,
      },
      {
        id: sampleUuid("a", 2),
        displayName: "Other",
        position: "D" as const,
        teamId: team,
        shirtNumber: 3,
      },
    ];
    const read = async (completeness: "COMPLETE" | "INCOMPLETE_PROVIDER_SQUAD") => {
      const repo = new InMemoryPlayerMappingRepository({
        candidates: [build(completeness)],
        appPlayers: players,
        qualifiedActors: [SAMPLE_ACTORS.proposer],
      });
      return repo.listMappingCandidatesForAppPlayer(sampleUuid("c", 1), team, 10, proposer);
    };
    const complete = await read("COMPLETE");
    const incomplete = await read("INCOMPLETE_PROVIDER_SQUAD");
    expect(incomplete.map((o) => [o.appPlayerId, o.score])).toEqual(
      complete.map((o) => [o.appPlayerId, o.score]),
    );
    // Every app player of the club is still offered: nobody is lowered for being absent.
    expect(incomplete).toHaveLength(players.length);
    for (const option of incomplete)
      expect(readOptionSignals(option.signals).flags).toContain("INCOMPLETE_PROVIDER_SQUAD");
    expect(
      complete.every(
        (o) => !readOptionSignals(o.signals).flags.includes("INCOMPLETE_PROVIDER_SQUAD"),
      ),
    ).toBe(true);
  });

  test("a two-squad candidate is offered both clubs' players, once each", async () => {
    const candidate = world.candidates.find((c) => c.observations.length === 2)!;
    const merged = await loadOptions(
      world.repository,
      {
        id: candidate.id!,
        observations: candidate.observations.map((o) => ({
          ...o,
          position: o.positionSignal,
          nationality: o.nationalitySignal,
          observedAt: "",
          dobJanuary1: o.dobJanuary1,
          heightCm: o.heightCm,
          shirtNumber: o.shirtNumber,
          registeredTeamDisagreement: o.registeredTeamDisagreement,
          registeredTeamId: o.registeredTeamId,
          squadCompleteness: o.squadCompleteness,
          appTeamId: o.appTeamId,
          clubKey: o.clubKey,
          dobState: o.dobState,
          providerTeamId: o.providerTeamId,
        })),
      },
      "club",
      proposer,
    );
    expect(merged).toHaveLength(76);
    expect(new Set(merged.map((o) => o.appPlayerId)).size).toBe(76);
    const everyone = await loadOptions(
      world.repository,
      { id: candidate.id!, observations: [] },
      "all",
      proposer,
    );
    expect(everyone).toHaveLength(200);
  });

  test("plausible options are the ones with an agreeing signal and no net conflict", () => {
    const option = (score: number): AppPlayerOption => ({
      appPlayerId: sampleUuid("a", score + 10),
      displayName: "x",
      position: null,
      signals: {},
      score,
      alreadyMappedForProvider: false,
    });
    expect(
      plausibleOptionCount([option(6), option(2), option(1), option(0), option(-1), option(-3)]),
    ).toBe(3);
  });
});

describe("preview categories (a way to read the queue, never a decision)", () => {
  const option = (
    id: number,
    score: number,
    signals: Partial<Record<"dob" | "shirt" | "position", string>>,
  ): AppPlayerOption => ({
    appPlayerId: sampleUuid("a", id),
    displayName: "x",
    position: null,
    score,
    alreadyMappedForProvider: false,
    signals: { dob: "no_signal", shirt: "no_signal", position: "no_signal", ...signals },
  });
  const plain = { flags: [] as string[] };

  test("A: one best option, a unique DOB match, no shirt or position conflict, complete squad", () => {
    const preview = classifyPreview(plain, [
      option(1, 6, { dob: "match", shirt: "match", position: "match" }),
      option(2, 0, {}),
    ]);
    expect(preview.category).toBe("A");
    expect(preview.reasons).toEqual([
      "unique_dob_match",
      "corroborated_by_shirt",
      "corroborated_by_position",
    ]);
  });

  test("A needs no corroboration beyond the DOB, but a shirt difference moves it to B", () => {
    expect(classifyPreview(plain, [option(1, 4, { dob: "match" })]).category).toBe("A");
    const preview = classifyPreview(plain, [option(1, 4, { dob: "match", shirt: "conflict" })]);
    expect(preview.category).toBe("B");
    expect(preview.reasons).toContain("dob_match_with_shirt_difference");
  });

  test("B: tied best options, several DOB matches, or no DOB at all", () => {
    expect(
      classifyPreview(plain, [
        option(1, 2, { shirt: "match", position: "match" }),
        option(2, 2, { shirt: "match", position: "match" }),
      ]).reasons,
    ).toContain("tied_top");
    expect(
      classifyPreview(plain, [option(1, 4, { dob: "match" }), option(2, 4, { dob: "match" })])
        .reasons,
    ).toEqual(["tied_top", "several_dob_matches"]);
    const noDob = classifyPreview(plain, [
      option(1, 2, { shirt: "match", position: "match" }),
      option(2, 1, { position: "match" }),
    ]);
    expect(noDob.category).toBe("B");
    expect(noDob.reasons).toEqual(["no_dob_signal"]);
  });

  test("an incomplete squad can never be A, and says so", () => {
    const preview = classifyPreview({ flags: ["INCOMPLETE_PROVIDER_SQUAD"] }, [
      option(1, 6, { dob: "match", shirt: "match", position: "match" }),
    ]);
    expect(preview.category).toBe("B");
    expect(preview.reasons).toContain("incomplete_squad");
  });

  test("C: nothing agrees, or there is nobody to compare", () => {
    expect(
      classifyPreview(plain, [option(1, 0, {}), option(2, -1, { position: "conflict" })]),
    ).toEqual({ category: "C", reasons: ["no_agreeing_signal"] });
    expect(classifyPreview(plain, [])).toEqual({ category: "C", reasons: ["no_options"] });
  });

  test("D: a best option from ANOTHER club is never a very strong suggestion, however well its date of birth matches", () => {
    const other = option(1, 6, { dob: "match", shirt: "match", position: "match" });
    other.signals = { ...other.signals, club: "mismatch" };
    const preview = classifyPreview(plain, [other, option(2, 0, {})]);
    expect(preview).toEqual({ category: "D", reasons: ["top_club_mismatch"] });
    // A player with no club on record is not a mismatch: it can still read as A.
    const noClub = option(1, 6, { dob: "match", shirt: "match", position: "match" });
    noClub.signals = { ...noClub.signals, club: "no_signal" };
    expect(classifyPreview(plain, [noClub]).category).toBe("A");
  });

  test("D: a DOB conflict or position disagreement at the top, two squads, or another registered team", () => {
    expect(classifyPreview(plain, [option(1, -2, { dob: "conflict" })]).reasons).toEqual([
      "top_dob_conflict",
    ]);
    expect(
      classifyPreview(plain, [option(1, 3, { dob: "match", position: "conflict" })]).reasons,
    ).toEqual(["top_position_conflict"]);
    expect(
      classifyPreview({ flags: ["MULTI_SQUAD_OBSERVATION"] }, [option(1, 6, { dob: "match" })])
        .category,
    ).toBe("D");
    expect(
      classifyPreview({ flags: ["REGISTERED_TEAM_DISAGREEMENT"] }, [option(1, 6, { dob: "match" })])
        .category,
    ).toBe("D");
  });

  test("missing evidence is never a reason for D, and a name is not an input", () => {
    const preview = classifyPreview(plain, [option(1, 0, {})]);
    expect(preview.category).toBe("C");
    expect(JSON.stringify(preview)).not.toMatch(/name/i);
  });

  test("it reads the sample the way the audit read production: Flashscore never reaches A", async () => {
    const world = buildSampleWorld({ sofascore: 120, flashscore: 90 });
    const all = await loadAllCandidates(world.repository, {}, proposer);
    const categories = { sofascore: new Set<string>(), flashscore: new Set<string>() };
    for (const candidate of all.slice(0, 210)) {
      const options = await loadOptions(world.repository, candidate, "club", proposer);
      categories[candidate.provider].add(classifyPreview(candidate, options).category);
    }
    expect(categories.flashscore.has("A")).toBe(false);
    expect(categories.sofascore.has("A")).toBe(true);
  });
});

describe("dual control", () => {
  const world = buildSampleWorld({ sofascore: 30, flashscore: 20 });

  let next = 0;
  async function propose(positionMatches = true) {
    // A fresh candidate each time: one open proposal per candidate.
    const candidate = (await loadAllCandidates(world.repository, {}, proposer))[next++]!;
    const options = await loadOptions(world.repository, candidate, "club", proposer);
    const pick = options.find(
      (o) =>
        (o.signals as { position?: string }).position === (positionMatches ? "match" : "conflict"),
    )!;
    const result = await world.repository.proposeMappings(
      [
        {
          kind: "map",
          [candidate.provider === "sofascore" ? "sofascoreCandidateId" : "flashscoreCandidateId"]:
            candidate.id,
          appPlayerId: pick.appPlayerId,
        } as never,
      ],
      "Même date de naissance et même poste.",
      crypto.randomUUID(),
      proposer,
    );
    const created = result.proposals[0]!;
    expect(created.ok).toBe(true);
    return {
      candidate,
      id: (created as { id: string }).id,
      fingerprint: (created as { fingerprint: string }).fingerprint,
    };
  }

  test("a proposal creates a proposal only: the candidate is 'proposed', no mapping exists", async () => {
    const { candidate } = await propose();
    const after = await world.repository.getMappingCandidate(candidate.id, proposer);
    expect(after.status).toBe("proposed");
    expect(world.repository.mappings).toHaveLength(0);
  });

  test("the proposer sees no approve control for their own proposal, and the server refuses it", async () => {
    const { id, fingerprint } = await propose();
    const mine = await world.repository.getMappingProposal(id, proposer);
    expect(mine.proposedByMe).toBe(true);
    expect(mine.canApprove).toBe(false);
    const control = dualControlFor(
      mine,
      { qualifiedReviewersAvailable: 1, secondReviewerRequired: false },
      { canManage: true },
    );
    expect(control).toMatchObject({
      role: "proposer",
      canDecide: false,
      blockedBy: "own_proposal",
    });
    await expect(
      world.repository.decideMappingProposal(
        { proposalId: id, decision: "approve", reason: "Je valide mon propre choix.", fingerprint },
        crypto.randomUUID(),
        proposer,
      ),
    ).rejects.toMatchObject({ code: "self_approval_denied" });
  });

  test("a different person sees approve and reject for the exact fingerprint", async () => {
    const { id, fingerprint } = await propose();
    const theirs = await world.repository.getMappingProposal(id, approver);
    expect(theirs.fingerprint).toBe(fingerprint);
    expect(theirs.canApprove).toBe(true);
    const control = dualControlFor(
      theirs,
      { qualifiedReviewersAvailable: 1, secondReviewerRequired: false },
      { canManage: true },
    );
    expect(control).toMatchObject({ canDecide: true, blockedBy: null });
  });

  test("with one qualified reviewer, the proposal waits and says SECOND QUALIFIED REVIEWER REQUIRED", async () => {
    const lonely = buildSampleWorld({ sofascore: 10, flashscore: 0 });
    const only = new InMemoryPlayerMappingRepository({
      candidates: lonely.candidates,
      appPlayers: lonely.appPlayers,
      qualifiedActors: [SAMPLE_ACTORS.proposer],
    });
    const availability = await only.getQualifiedReviewerAvailability(proposer);
    expect(availability).toEqual({ qualifiedReviewersAvailable: 0, secondReviewerRequired: true });
    const candidate = lonely.candidates[0]!;
    const options = await only.listMappingCandidatesForAppPlayer(candidate.id!, null, 5, proposer);
    const created = await only.proposeMappings(
      [{ kind: "map", sofascoreCandidateId: candidate.id!, appPlayerId: options[0]!.appPlayerId }],
      "Un seul relecteur qualifié existe.",
      crypto.randomUUID(),
      proposer,
    );
    const proposal = await only.getMappingProposal(
      (created.proposals[0] as { id: string }).id,
      proposer,
    );
    const control = dualControlFor(proposal, availability, { canManage: true });
    expect(control.canDecide).toBe(false);
    expect(control.showSecondReviewerRequired).toBe(true);
    expect(waitingForSecondReviewer([proposal])).toHaveLength(1);
  });

  test("a viewer without football.manage_mappings is never offered a decision", async () => {
    const { id } = await propose();
    const theirs = await world.repository.getMappingProposal(id, approver);
    expect(
      dualControlFor(
        theirs,
        { qualifiedReviewersAvailable: 1, secondReviewerRequired: false },
        { canManage: false },
      ),
    ).toMatchObject({ canDecide: false, blockedBy: "no_permission" });
  });

  test("expired and held proposals offer nothing, and the held view finds them", async () => {
    const { id } = await propose();
    world.repository.patchProposal(id, { effectiveStatus: "expired" });
    const expired = await world.repository.getMappingProposal(id, approver);
    expect(
      dualControlFor(
        expired,
        { qualifiedReviewersAvailable: 1, secondReviewerRequired: false },
        { canManage: true },
      ).blockedBy,
    ).toBe("expired");
    expect(heldProposals([expired])).toHaveLength(1);
    world.repository.patchProposal(id, {
      effectiveStatus: "stale_evidence",
      status: "stale_evidence",
    });
    const stale = await world.repository.getMappingProposal(id, approver);
    expect(
      dualControlFor(
        stale,
        { qualifiedReviewersAvailable: 1, secondReviewerRequired: false },
        { canManage: true },
      ).blockedBy,
    ).toBe("held");
    expect(heldProposals([stale])).toHaveLength(1);
  });

  test("no direct browser table access: the screen's logic goes through the repository only", async () => {
    for (const file of ["./review-queue.ts"]) {
      const source = await Bun.file(new URL(file, import.meta.url)).text();
      expect(/\.from\(["'`]|supabase|football_player_mapping_|\.schema\(/i.test(source)).toBe(
        false,
      );
    }
  });
});

describe("small helpers", () => {
  test("arrow keys, Home and End move through rows and stop at the ends; other keys are left alone", () => {
    expect(nextRowIndex("ArrowDown", 0, 3)).toBe(1);
    expect(nextRowIndex("ArrowDown", 2, 3)).toBe(2);
    expect(nextRowIndex("ArrowUp", 0, 3)).toBe(0);
    expect(nextRowIndex("ArrowUp", 2, 3)).toBe(1);
    expect(nextRowIndex("Home", 2, 3)).toBe(0);
    expect(nextRowIndex("End", 0, 3)).toBe(2);
    expect(nextRowIndex("Enter", 0, 3)).toBeNull();
    expect(nextRowIndex("ArrowDown", 0, 0)).toBeNull();
  });

  test("bounded concurrency: never more in flight than asked, results in input order", async () => {
    let inFlight = 0;
    let peak = 0;
    const out = await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7, 8], 3, async (n) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 2));
      inFlight -= 1;
      return n * 10;
    });
    expect(out).toEqual([10, 20, 30, 40, 50, 60, 70, 80]);
    expect(peak).toBeLessThanOrEqual(3);
    expect(await mapWithConcurrency([], 4, async (n: number) => n)).toEqual([]);
  });

  test("unrecognised signal values are no signal", () => {
    expect(readOptionSignals({ dob: "weird", shirt: 3, position: null })).toMatchObject({
      dob: "no_signal",
      shirt: "no_signal",
      position: "no_signal",
      flags: [],
    });
  });
});

// Keeps the unused-type imports honest.
export type _Unused = ProposalDto | ReviewerAvailability;
