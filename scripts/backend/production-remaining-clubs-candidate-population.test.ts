import { readFileSync } from "node:fs";
import { describe, expect, it } from "bun:test";
import { CLUB_PROVIDER_TEAMS } from "../../src/backend/football/identity/club-registry";
import {
  APP_TEAM_IDS,
  RECORDER_MAX,
  expectedAfter,
  populationProblems,
  remainingClubs,
} from "./production-remaining-clubs-candidate-population";
import { UNCHANGED_KEYS } from "./production-mas-fes-candidate-canary";

const rec = (provider: "sofascore" | "flashscore", id: string) => ({
  provider,
  externalPlayerId: id,
});

describe("remaining-15-clubs candidate population", () => {
  it("covers every club except Maghreb Fès, each with an app team id", () => {
    const clubs = remainingClubs();
    expect(clubs).toHaveLength(15);
    expect(clubs.map((c) => c.clubKey)).not.toContain("maghreb-fes");
    expect(CLUB_PROVIDER_TEAMS).toHaveLength(16);
    for (const club of clubs) expect(APP_TEAM_IDS[club.clubKey]).toMatch(/^[0-9a-f-]{36}$/);
    expect(new Set(Object.values(APP_TEAM_IDS)).size).toBe(15);
    expect(Object.keys(APP_TEAM_IDS).sort()).toEqual(clubs.map((c) => c.clubKey).sort());
    expect(RECORDER_MAX).toBe(2000);
  });

  it("expects one candidate per new provider id and one observation per submitted record", () => {
    const existing = ["sofascore|s1", "flashscore|f1"];
    const records = [rec("sofascore", "s2"), rec("sofascore", "s3"), rec("flashscore", "f2")];
    const expected = expectedAfter(existing, records);
    expect(expected.newCandidates).toBe(3);
    expect(expected.overlapWithExisting).toBe(0);
    expect(expected.candidates).toEqual({ sofascore: 3, flashscore: 2 });
    expect(expected.observations).toEqual({ sofascore: 3, flashscore: 2 });
    expect(expected.multiSquad).toBe(0);
  });

  it("treats a provider id already recorded, or seen in two new squads, as one candidate with several observations", () => {
    const existing = ["sofascore|s1"];
    const records = [rec("sofascore", "s1"), rec("sofascore", "s2"), rec("sofascore", "s2")];
    const expected = expectedAfter(existing, records);
    expect(expected.newCandidates).toBe(1);
    expect(expected.overlapWithExisting).toBe(1);
    expect(expected.candidates.sofascore).toBe(2);
    expect(expected.observations.sofascore).toBe(4);
    expect(expected.multiSquad).toBe(2);
  });

  it("checks the effect after the write and that the earlier rows were not touched", () => {
    const base = Object.fromEntries(
      UNCHANGED_KEYS.map((k) => [k, k === "fantasy_table_counts" ? { a: 1 } : 1]),
    );
    const expected = expectedAfter(["sofascore|s1"], [rec("sofascore", "s2")]);
    const after = {
      ...base,
      candidates: 2,
      candidates_sofascore: 2,
      candidates_flashscore: 0,
      observations: 2,
      observations_sofascore: 2,
      observations_flashscore: 0,
      duplicate_candidate_identities: 0,
      multi_squad_candidates: 0,
      candidates_with_status_other_than_unmapped: 0,
      proposals: 0,
      reviewed_provider_mapping_rows: 0,
    };
    const extra = {
      app_teams_found: 15,
      existing_observation_digest: "x",
      existing_identities: [],
    };
    expect(
      populationProblems(
        { ...base, proposals: 0, reviewed_provider_mapping_rows: 0 },
        after,
        extra,
        extra,
        expected,
      ),
    ).toEqual([]);
    expect(
      populationProblems(
        { ...base, proposals: 0, reviewed_provider_mapping_rows: 0 },
        { ...after, proposals: 1 },
        extra,
        extra,
        expected,
      ).length,
    ).toBeGreaterThan(0);
    expect(
      populationProblems(
        { ...base, proposals: 0, reviewed_provider_mapping_rows: 0 },
        after,
        extra,
        { ...extra, existing_observation_digest: "y" },
        expected,
      ),
    ).toContain("changed:existing_mas_fes_observations");
  });

  it("has one recorder call, no direct table write and no name in any log line", () => {
    const source = readFileSync(
      "scripts/backend/production-remaining-clubs-candidate-population.ts",
      "utf8",
    );
    expect(source.match(/callRecorderOnce\(serviceKey/g)).toHaveLength(1);
    expect(source).not.toMatch(/rest\/v1\/football_player_mapping|admin_football_mapping/);
    expect(source).not.toMatch(/console\.log\([^)]*(displayName|birthDate)/);
  });

  it("has a guarded workflow with no schedule that gives the service key only to the write step", () => {
    const workflow = readFileSync(
      ".github/workflows/production-remaining-clubs-candidate-population.yml",
      "utf8",
    );
    for (const needle of [
      "github.ref == 'refs/heads/main'",
      "github.actor == 'mrdata007'",
      "environment: production-admin-activation",
      "GITHUB_WORKFLOW_RERUN_FORBIDDEN",
      "group: botolago-production-v2-mutation",
      "DRY_RUN_REMAINING_15_CLUBS",
      "WRITE_REMAINING_15_CLUBS",
      "SUPABASE_SECRET_KEY: ${{ inputs.mode == 'write' && secrets.SUPABASE_SECRET_KEY || '' }}",
    ])
      expect(workflow).toContain(needle);
    expect(workflow).not.toMatch(/^\s+(push|pull_request|schedule):/m);
    const install = workflow.split("Install dependencies")[1]?.split("- name:")[0] ?? "";
    expect(install).not.toContain("secrets.");
  });
});
