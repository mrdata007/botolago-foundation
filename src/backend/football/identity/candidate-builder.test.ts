import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  groupCandidates,
  recordCollection,
  SupabaseObservationSink,
  toObservationRecords,
  type ObservationRecord,
} from "./candidate-builder";
import type { CLUB_PROVIDER_TEAMS as Registry } from "./club-registry";
import { CLUB_PROVIDER_TEAMS } from "./club-registry";
import { collectSquads, type FetchJson } from "./collector";
import type { MappingRpcClient } from "./mapping-repository";
import {
  flashPayload,
  flashSquadEntries,
  NOW,
  seconds,
  sofaEntry,
  sofaPayload,
  sofaSquadEntries,
} from "./test-support";

const clubs: typeof Registry = CLUB_PROVIDER_TEAMS.slice(0, 2);

/** Sofascore id 777 appears in BOTH clubs' squads; everything else is distinct. */
function collectionWithSharedId(shared = true) {
  const fetchJson: FetchJson = async (provider, path) => {
    const clubIndex = clubs.findIndex(
      (club) => path.includes(String(club.sofascoreTeamId)) || path.includes(club.flashscoreTeamId),
    );
    if (provider === "flashscore")
      return { status: 200, body: flashPayload(flashSquadEntries(24, `b${clubIndex}`)) };
    const entries = sofaSquadEntries(24, 5000 * (clubIndex + 1), clubs[clubIndex]!.sofascoreTeamId);
    if (shared)
      entries.push(
        sofaEntry({
          id: 777,
          name: "Shared Person",
          position: "F",
          shirtNumber: 9,
          dateOfBirthTimestamp: seconds("1995-05-05"),
          dateOfBirth: "1995-05-05T00:00:00+00:00",
          teamId: clubs[0]!.sofascoreTeamId,
        }),
      );
    return { status: 200, body: sofaPayload(entries) };
  };
  return collectSquads({ fetchJson, now: NOW, clubs });
}

describe("candidate builder", () => {
  test("the same Sofascore id in two squads is ONE candidate with both observations kept", async () => {
    const records = toObservationRecords(await collectionWithSharedId());
    const candidates = groupCandidates(records);
    const shared = candidates.filter(
      (c) => c.provider === "sofascore" && c.externalPlayerId === "777",
    );
    expect(shared).toHaveLength(1);
    expect(shared[0]!.observations.map((o) => o.providerTeamId).sort()).toEqual(
      clubs.map((c) => String(c.sofascoreTeamId)).sort(),
    );
    expect(shared[0]!.flags).toContain("MULTI_SQUAD_OBSERVATION");
  });

  test("that is the only difference: nothing calls it a duplicate, transfer or collision", async () => {
    const candidates = groupCandidates(toObservationRecords(await collectionWithSharedId()));
    const shared = candidates.find((c) => c.externalPlayerId === "777")!;
    expect(shared.flags).toEqual(["MULTI_SQUAD_OBSERVATION"]);
    expect(JSON.stringify(shared)).not.toMatch(/duplicate|transfer|collision|reject|negative/i);
  });

  test("an id seen in one squad is not flagged, and ids are never merged across providers", async () => {
    const candidates = groupCandidates(toObservationRecords(await collectionWithSharedId(false)));
    expect(candidates.every((c) => !c.flags.includes("MULTI_SQUAD_OBSERVATION"))).toBe(true);
    expect(new Set(candidates.map((c) => `${c.provider}|${c.externalPlayerId}`)).size).toBe(
      candidates.length,
    );
  });

  test("a candidate's identity is provider + player id: the same id under two clubs never makes two", async () => {
    const records = toObservationRecords(await collectionWithSharedId());
    const keys = groupCandidates(records).map((c) => `${c.provider}|${c.externalPlayerId}`);
    expect(keys.filter((k) => k === "sofascore|777")).toHaveLength(1);
    expect(records.filter((r) => r.externalPlayerId === "777")).toHaveLength(2);
  });

  test("the requested squad is carried as context and the club mismatch is only a flag on the observation", async () => {
    const records = toObservationRecords(await collectionWithSharedId());
    const second = records.find(
      (r) => r.externalPlayerId === "777" && r.providerTeamId === String(clubs[1]!.sofascoreTeamId),
    )!;
    expect(second.registeredTeamDisagreement).toBe(true);
    expect(groupCandidates([second])).toHaveLength(1);
  });

  test("names travel only as displayName; the grouped candidate has no name at all", async () => {
    const records = toObservationRecords(await collectionWithSharedId());
    expect(records.find((r) => r.externalPlayerId === "777")!.displayName).toBe("Shared Person");
    expect(JSON.stringify(groupCandidates(records))).not.toContain("Shared Person");
    expect(JSON.stringify(groupCandidates(records))).not.toContain("displayName");
  });

  test("a failed or invalid squad response contributes no evidence", async () => {
    const fetchJson: FetchJson = async () => ({ status: 500, body: null });
    const collection = await collectSquads({ fetchJson, now: NOW, clubs });
    expect(toObservationRecords(collection)).toEqual([]);
  });

  test("an incomplete provider squad is flagged on its candidates and costs them nothing else", async () => {
    const fetchJson: FetchJson = async (provider) => ({
      status: 200,
      body:
        provider === "flashscore"
          ? flashPayload(flashSquadEntries(16, "short"))
          : sofaPayload(sofaSquadEntries(30)),
    });
    const collection = await collectSquads({ fetchJson, now: NOW, clubs: clubs.slice(0, 1) });
    const flash = groupCandidates(toObservationRecords(collection)).filter(
      (c) => c.provider === "flashscore",
    );
    expect(flash).toHaveLength(16);
    expect(flash.every((c) => c.flags.join() === "INCOMPLETE_PROVIDER_SQUAD")).toBe(true);
  });

  test("a valid date and a missing one both pass through as they are (no signal is invented)", async () => {
    const records = toObservationRecords(await collectionWithSharedId());
    const states = new Set(
      records.filter((r) => r.provider === "sofascore").map((r) => r.dobState),
    );
    expect(states.has("valid")).toBe(true);
    expect(
      records
        .filter((r) => r.provider === "flashscore")
        .every((r) => r.dobState === "not_provided" && r.birthDate === null),
    ).toBe(true);
  });

  test("it builds records only: no proposal and no mapping exists anywhere in its output", async () => {
    const records = toObservationRecords(await collectionWithSharedId());
    expect(JSON.stringify(records)).not.toMatch(/proposal|mapping|approve/i);
  });
});

describe("observation sink", () => {
  const record = (n: number): ObservationRecord => ({
    provider: "sofascore",
    externalPlayerId: String(n),
    providerTeamId: "1",
    clubKey: "club",
    appTeamId: null,
    squadCompleteness: "COMPLETE",
    registeredTeamId: null,
    registeredTeamDisagreement: false,
    shirtNumber: null,
    positionSignal: null,
    dobState: "missing",
    birthDate: null,
    dobJanuary1: false,
    heightCm: null,
    nationalitySignal: null,
    displayName: null,
  });
  const fakeRpc = (calls: { name: string; size: number }[]): MappingRpcClient => ({
    rpc: (name, args) => {
      const size = (args.p_observations as unknown[]).length;
      calls.push({ name, size });
      return Promise.resolve({
        data: {
          candidatesCreated: size,
          observationsSeen: size,
          observationsCreated: size,
          observationsChanged: 0,
          revisionsBumped: size,
        },
        error: null,
      }) as ReturnType<MappingRpcClient["rpc"]>;
    },
  });

  test("writes through the one trusted function, in chunks, and returns counts only", async () => {
    const calls: { name: string; size: number }[] = [];
    const summary = await new SupabaseObservationSink(fakeRpc(calls)).record(
      Array.from({ length: 1201 }, (_, i) => record(i + 1)),
    );
    expect(calls.map((c) => c.name)).toEqual(Array(3).fill("football_mapping_record_observations"));
    expect(calls.map((c) => c.size)).toEqual([500, 500, 201]);
    expect(summary).toEqual({
      candidatesCreated: 1201,
      observationsSeen: 1201,
      observationsCreated: 1201,
      observationsChanged: 0,
      revisionsBumped: 1201,
    });
  });

  test("a database refusal becomes a stable error and an odd answer is refused", async () => {
    const failing: MappingRpcClient = {
      rpc: () =>
        Promise.resolve({
          data: null,
          error: {
            message: "permission denied",
            code: "42501",
            details: "",
            hint: "",
            name: "PostgrestError",
          },
        }) as ReturnType<MappingRpcClient["rpc"]>,
    };
    await expect(new SupabaseObservationSink(failing).record([record(1)])).rejects.toMatchObject({
      code: "staff_access_denied",
    });
    const odd: MappingRpcClient = {
      rpc: () =>
        Promise.resolve({ data: { nope: true }, error: null }) as ReturnType<
          MappingRpcClient["rpc"]
        >,
    };
    await expect(new SupabaseObservationSink(odd).record([record(1)])).rejects.toMatchObject({
      code: "mapping_unavailable",
    });
  });

  test("recordCollection hands the collector's result to the sink without proposing anything", async () => {
    const calls: { name: string; size: number }[] = [];
    const sink = new SupabaseObservationSink(fakeRpc(calls));
    const summary = await recordCollection(sink, await collectionWithSharedId());
    expect(summary.observationsSeen).toBe(24 * 2 + 1 + 1 + 24 * 2);
    expect(new Set(calls.map((c) => c.name))).toEqual(
      new Set(["football_mapping_record_observations"]),
    );
  });

  test("the builder's source never touches a table, a proposal or the console", () => {
    const code = readFileSync(new URL("./candidate-builder.ts", import.meta.url), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toMatch(
      /\.from\(|console\.|node:|football_provider_mappings|admin_football_mapping|createClient/,
    );
    expect(code.match(/rpc\("([a-z_]+)"/g)).toEqual(['rpc("football_mapping_record_observations"']);
  });
});
