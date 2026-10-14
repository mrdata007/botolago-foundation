import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { assertReadOnly } from "./sofascore-id-bridge-fetch";
import {
  analyse,
  clubsSql,
  fetchSquads,
  mappedIdsSql,
  membersSql,
  type Collected,
} from "./sofascore-squad-link";

const SEASON = "11111111-1111-4111-8111-111111111111";
const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe("the queries", () => {
  test("every query is a single read-only SELECT", () => {
    for (const names of [false, true]) {
      assertReadOnly(clubsSql(SEASON, names));
      assertReadOnly(membersSql(SEASON, names));
    }
    assertReadOnly(mappedIdsSql());
  });
  test("names leave the database only on request", () => {
    expect(clubsSql(SEASON, false)).toContain("'displayName', null");
    expect(membersSql(SEASON, false)).toContain("'displayName', null");
    expect(membersSql(SEASON, true)).toContain("p.display_name");
    expect(membersSql(SEASON, false)).not.toContain("p.display_name");
  });
  test("an id that is a second SofaScore id of a player counts as linked", () => {
    expect(mappedIdsSql()).toContain("from app_private.football_provider_mappings");
    expect(mappedIdsSql()).toContain("select sofascore_player_id from app_private.sofascore_player_aliases");
  });
  test("a season id that is not a uuid is refused", () => {
    expect(() => membersSql("x'; drop table y; --", false)).toThrow(/squad_link_invalid/);
  });
});

const squadReply = (
  players: Array<{ id: number; shirt?: number; position?: string; name?: string }>,
) => ({
  players: players.map((p) => ({
    player: { id: p.id, name: p.name ?? "Some Name", position: p.position, jerseyNumber: p.shirt },
  })),
});

function fakeClient(replies: Record<string, unknown>) {
  const paths: string[] = [];
  return {
    paths,
    client: {
      requestsSent: () => paths.length,
      getJson: async (path: string) => {
        paths.push(path);
        if (!(path in replies)) throw new Error("not found");
        return replies[path];
      },
    },
  };
}

describe("fetchSquads", () => {
  const clubs = [
    { internalTeamId: U(1), sofascoreTeamId: "7001" },
    { internalTeamId: U(2), sofascoreTeamId: "7002" },
  ];
  test("one request per club, positions mapped, names only when asked", async () => {
    const { client, paths } = fakeClient({
      "teams/get-squad?teamId=7001": squadReply([{ id: 11, shirt: 9, position: "F", name: "A B" }]),
      "teams/get-squad?teamId=7002": squadReply([{ id: 22, shirt: 1, position: "G" }]),
    });
    const quiet = await fetchSquads(client, clubs, { showNames: false, maxRequests: 40 });
    expect(paths).toEqual(["teams/get-squad?teamId=7001", "teams/get-squad?teamId=7002"]);
    expect(
      quiet.entries.map((e) => [e.sofascorePlayerId, e.shirt, e.position, e.displayName]),
    ).toEqual([
      ["11", 9, "F", null],
      ["22", 1, "G", null],
    ]);
    const shown = await fetchSquads(client, clubs, { showNames: true, maxRequests: 40 });
    expect(shown.entries[0]?.displayName).toBe("A B");
  });
  test("a failed squad is reported and the others carry on", async () => {
    const { client } = fakeClient({
      "teams/get-squad?teamId=7002": squadReply([{ id: 22, shirt: 1, position: "G" }]),
    });
    const r = await fetchSquads(client, clubs, { showNames: false, maxRequests: 40 });
    expect(r.failed).toEqual(["7001"]);
    expect(r.entries).toHaveLength(1);
  });
  test("the request cap stops the run", async () => {
    const { client } = fakeClient({ "teams/get-squad?teamId=7001": squadReply([]) });
    await expect(fetchSquads(client, clubs, { showNames: false, maxRequests: 1 })).rejects.toThrow(
      /squad_link_request_cap/,
    );
  });
});

describe("analyse", () => {
  const collected: Collected = {
    clubs: [{ internalId: U(1), sofascoreId: "7001", displayName: null }],
    members: [
      { playerId: U(10), teamId: U(1), shirt: 9, position: "forward", mapping: "none" },
      { playerId: U(11), teamId: U(1), shirt: 1, position: "goalkeeper", mapping: "none" },
      { playerId: U(12), teamId: U(1), shirt: 5, position: "defender", mapping: "active" },
      { playerId: U(13), teamId: U(1), shirt: 20, position: "midfielder", mapping: "none" },
    ],
    mappedIds: ["500"],
  };
  const report = analyse({
    collected,
    squads: [
      { sofascoreTeamId: "7001", sofascorePlayerId: "100", shirt: 9, position: "F" },
      { sofascoreTeamId: "7001", sofascorePlayerId: "101", shirt: 1, position: "D" },
      { sofascoreTeamId: "7001", sofascorePlayerId: "500", shirt: 5, position: "D" },
      { sofascoreTeamId: "7001", sofascorePlayerId: "102", shirt: 77, position: "M" },
    ],
    failedSquads: [],
    showNames: false,
    sofascoreRequests: 1,
    generatedAt: "2026-10-13T00:00:00Z",
  });

  test("confirmed, suggestions and unmatched are separated and counted", () => {
    expect(report.result.confirmed.map((c) => c.sofascorePlayerId)).toEqual(["100"]);
    expect(report.result.suggestions).toHaveLength(0);
    // 101 is a defender on a goalkeeper's shirt: never linked. 102 has no candidate.
    expect(report.result.unmatchedSquad.map((u) => [u.sofascorePlayerId, u.reason])).toEqual([
      ["101", "position_mismatch"],
      ["102", "no_candidate"],
    ]);
    expect(report.result.unmatchedCatalog.map((u) => u.playerId).sort()).toEqual(
      [U(11), U(13)].sort(),
    );
    expect(report.result.counts).toMatchObject({
      confirmed: 1,
      linkedAutomatically: 1,
      needReview: 0,
      alreadyMapped: 1,
    });
    expect(report.inputs.existingSofascorePlayerMappings).toBe(1);
  });
});

describe("the read-only workflow", () => {
  const workflow = readFileSync(
    join(import.meta.dir, "../../.github/workflows/sofascore-squad-link-production-read.yml"),
    "utf8",
  );
  test("is owner-only, from main, read-only and prints the counts in the summary", () => {
    expect(workflow).toContain("github.actor == 'mrdata007'");
    expect(workflow).toContain("refs/heads/main");
    expect(workflow).toContain("scripts/backend/sofascore-squad-link.ts");
    expect(workflow).toContain("--read-production");
    expect(workflow).toContain("summary.md");
    expect(workflow).toContain("GITHUB_STEP_SUMMARY");
    expect(workflow).toContain("show_names");
    expect(workflow).toMatch(/show_names:[\s\S]*?default: false/);
    expect(workflow).not.toContain("args+=(--emit-sql");
    expect(workflow).not.toMatch(/supabase db push|supabase functions deploy/);
  });
});
