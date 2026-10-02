import { readFileSync } from "node:fs";
import { describe, expect, it } from "bun:test";
import type { ObservationRecord } from "../../src/backend/football/identity/candidate-builder";
import { CLUB_PROVIDER_TEAMS } from "../../src/backend/football/identity/club-registry";
import {
  APP_TEAM_ID,
  CLUB_KEY,
  PRE_EXPECT,
  SNAPSHOT_SQL,
  UNCHANGED_KEYS,
  dryRunCounts,
  postWriteProblems,
  safeCode,
  validateRecord,
} from "./production-mas-fes-candidate-canary";

const record = (over: Partial<ObservationRecord> = {}): ObservationRecord => ({
  provider: "sofascore",
  externalPlayerId: "1001",
  providerTeamId: "55035",
  clubKey: CLUB_KEY,
  appTeamId: APP_TEAM_ID,
  squadCompleteness: "COMPLETE",
  registeredTeamId: null,
  registeredTeamDisagreement: false,
  shirtNumber: 7,
  positionSignal: "M",
  dobState: "valid",
  birthDate: "1999-05-17",
  dobJanuary1: false,
  heightCm: 180,
  nationalitySignal: "alpha2:MA",
  displayName: "Test Player",
  ...over,
});

describe("MAS Fès candidate canary", () => {
  it("is scoped to the one club and its resolved provider team ids", () => {
    const club = CLUB_PROVIDER_TEAMS.find((c) => c.clubKey === CLUB_KEY);
    expect(club?.sofascoreTeamId).toBe(55035);
    expect(club?.flashscoreTeamId).toBe("ptdhYAkN");
    expect(APP_TEAM_ID).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("accepts a well-formed record and rejects each kind of malformed one", () => {
    expect(validateRecord(record())).toEqual([]);
    expect(validateRecord(record({ externalPlayerId: " 1" }))).toContain("externalPlayerId");
    expect(validateRecord(record({ providerTeamId: "" }))).toContain("providerTeamId");
    expect(validateRecord(record({ shirtNumber: 100 }))).toContain("shirtNumber");
    expect(validateRecord(record({ heightCm: 119 }))).toContain("heightCm");
    expect(validateRecord(record({ dobState: "valid", birthDate: null }))).toContain("birthDate");
    expect(validateRecord(record({ dobState: "missing", birthDate: "1999-05-17" }))).toContain(
      "birthDate",
    );
    expect(
      validateRecord(record({ dobState: "missing", birthDate: null, dobJanuary1: true })),
    ).toContain("dobJanuary1");
    expect(validateRecord(record({ nationalitySignal: "Morocco" }))).toContain("nationalitySignal");
    expect(validateRecord(record({ positionSignal: "X" as never }))).toContain("positionSignal");
  });

  it("builds sanitized dry-run counts without a name or a date", () => {
    const records = [
      record(),
      record({
        externalPlayerId: "1002",
        dobState: "missing",
        birthDate: null,
        positionSignal: null,
      }),
      record({
        provider: "flashscore",
        externalPlayerId: "f1",
        providerTeamId: "ptdhYAkN",
        dobState: "not_provided",
        birthDate: null,
        registeredTeamDisagreement: true,
      }),
    ];
    const squads = [
      {
        provider: "sofascore",
        status: "ok",
        completeness: { state: "COMPLETE" },
        players: [1, 2],
        diagnostics: { duplicateIds: [] },
      },
      {
        provider: "flashscore",
        status: "ok",
        completeness: { state: "COMPLETE" },
        players: [1],
        diagnostics: { duplicateIds: [] },
      },
    ];
    const counts = dryRunCounts(records, squads);
    expect(counts.observationsToSubmit).toBe(3);
    expect(counts.uniqueIdentities).toEqual({ sofascore: 2, flashscore: 1 });
    expect(counts.dobStates).toEqual({ valid: 1, missing: 1, not_provided: 1 });
    expect(counts.positionSignals).toEqual({ M: 2, none: 1 });
    expect(counts.registeredTeamDisagreements).toBe(1);
    expect(counts.malformedItems).toBe(0);
    const text = JSON.stringify(counts);
    expect(text).not.toContain("Test Player");
    expect(text).not.toContain("1999");
  });

  it("counts a shared provider id once as a candidate with two observations", () => {
    const counts = dryRunCounts(
      [record(), record({ providerTeamId: "99999" })],
      [
        {
          provider: "sofascore",
          status: "ok",
          completeness: { state: "COMPLETE" },
          players: [1],
          diagnostics: { duplicateIds: [] },
        },
      ],
    );
    expect(counts.uniqueIdentities.sofascore).toBe(1);
    expect(counts.observationsToSubmit).toBe(2);
    expect(counts.multiSquadIds).toBe(1);
  });

  it("only ever prints a stable one-word error code", () => {
    expect(safeCode({ message: "invalid_observations" }, 400)).toBe("invalid_observations");
    expect(safeCode({ message: 'invalid input syntax for type date: "1999-02-30"' }, 400)).toBe(
      "http_400",
    );
    expect(safeCode({ message: "x", code: "22007" }, 400)).toBe("sqlstate_22007");
    expect(safeCode(null, null)).toBe("no_response");
  });

  it("checks the effect after the write against the expected counts", () => {
    const base = Object.fromEntries(
      UNCHANGED_KEYS.map((k) => [k, k === "fantasy_table_counts" ? { a: 1 } : 1]),
    );
    const after = {
      ...base,
      candidates: 3,
      candidates_sofascore: 2,
      candidates_flashscore: 1,
      observations: 4,
      observations_sofascore: 3,
      observations_flashscore: 1,
      duplicate_candidate_identities: 0,
      multi_squad_candidates: 1,
      candidates_with_status_other_than_unmapped: 0,
      proposals: 0,
      reviewed_provider_mapping_rows: 0,
    };
    const expected = {
      candidates: { sofascore: 2, flashscore: 1 },
      observations: { sofascore: 3, flashscore: 1 },
      multiSquad: 1,
    };
    const beforeOk = { ...base, proposals: 0, reviewed_provider_mapping_rows: 0 };
    expect(postWriteProblems(beforeOk, { ...after, proposals: 0 }, expected)).toEqual([]);
    expect(
      postWriteProblems(beforeOk, { ...after, proposals: 1 }, expected).length,
    ).toBeGreaterThan(0);
    expect(
      postWriteProblems(beforeOk, { ...after, duplicate_candidate_identities: 1 }, expected).length,
    ).toBeGreaterThan(0);
    expect(postWriteProblems(beforeOk, { ...after, mapping_rows: 2 }, expected)).toContain(
      "changed:mapping_rows",
    );
  });

  it("pre-flight pins the post-deployment state", () => {
    expect(PRE_EXPECT.candidates).toBe(0);
    expect(PRE_EXPECT.proposals).toBe(0);
    expect(PRE_EXPECT.resolver_md5).toBe("c4c7253284afa52aea055f74e3806d73");
    expect(SNAPSHOT_SQL).not.toMatch(/\b(insert|update|delete|drop)\b\s/i);
  });

  it("has no direct table write, no proposal or mapping path, and one recorder call", () => {
    const source = readFileSync("scripts/backend/production-mas-fes-candidate-canary.ts", "utf8");
    expect(source.match(/callRecorderOnce\(serviceKey/g)).toHaveLength(1);
    expect(source).not.toMatch(
      /rest\/v1\/football_player_mapping|admin_football_mapping|football_provider_mappings"/,
    );
    expect(source).not.toMatch(/console\.log\([^)]*displayName/);
  });
});

describe("MAS Fès candidate canary workflow", () => {
  const workflow = readFileSync(
    ".github/workflows/production-mas-fes-candidate-canary.yml",
    "utf8",
  );
  it("is guarded like the other production workflows and has no schedule", () => {
    expect(workflow).toContain("github.ref == 'refs/heads/main'");
    expect(workflow).toContain("github.actor == 'mrdata007'");
    expect(workflow).toContain("environment: production-admin-activation");
    expect(workflow).toContain("GITHUB_WORKFLOW_RERUN_FORBIDDEN");
    expect(workflow).toContain("group: botolago-production-v2-mutation");
    expect(workflow).toContain("DRY_RUN_MAS_FES_CANDIDATES");
    expect(workflow).toContain("WRITE_MAS_FES_CANDIDATES");
    expect(workflow).not.toMatch(/^\s+(push|pull_request|schedule):/m);
  });
  it("gives the service key only to the write step and installs dependencies without secrets", () => {
    expect(workflow).toContain(
      "SUPABASE_SECRET_KEY: ${{ inputs.mode == 'write' && secrets.SUPABASE_SECRET_KEY || '' }}",
    );
    const install = workflow.split("Install dependencies")[1]?.split("- name:")[0] ?? "";
    expect(install).not.toContain("secrets.");
  });
});
