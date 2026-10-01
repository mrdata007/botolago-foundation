import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { CLUB_PROVIDER_TEAMS } from "./club-registry";
import {
  collectSquads,
  flashscoreSquadPath,
  sofascoreSquadPath,
  type FetchJson,
} from "./collector";
import {
  flashPayload,
  flashSquadEntries,
  NOW,
  sofaPayload,
  sofaSquadEntries,
} from "./test-support";

const clubs = CLUB_PROVIDER_TEAMS.slice(0, 3);

/** A fetcher that answers every squad request with a healthy squad and records the paths asked. */
function healthyFetcher(asked: { provider: string; path: string }[] = []): FetchJson {
  return async (provider, path) => {
    asked.push({ provider, path });
    const index = clubs.findIndex(
      (club) => path.includes(String(club.sofascoreTeamId)) || path.includes(club.flashscoreTeamId),
    );
    return {
      status: 200,
      body:
        provider === "sofascore"
          ? sofaPayload(sofaSquadEntries(30, 10_000 * (index + 1), clubs[index]!.sofascoreTeamId))
          : flashPayload(flashSquadEntries(28, `c${index}`)),
    };
  };
}

describe("registry", () => {
  test("16 clubs, each with distinct provider team ids", () => {
    expect(CLUB_PROVIDER_TEAMS).toHaveLength(16);
    expect(new Set(CLUB_PROVIDER_TEAMS.map((c) => c.sofascoreTeamId)).size).toBe(16);
    expect(new Set(CLUB_PROVIDER_TEAMS.map((c) => c.flashscoreTeamId)).size).toBe(16);
    expect(new Set(CLUB_PROVIDER_TEAMS.map((c) => c.clubKey)).size).toBe(16);
  });
});

describe("collectSquads", () => {
  test("asks each provider once per club, only for the squad endpoints", async () => {
    const asked: { provider: string; path: string }[] = [];
    const result = await collectSquads({ fetchJson: healthyFetcher(asked), now: NOW, clubs });
    expect(asked).toHaveLength(6);
    for (const club of clubs) {
      expect(asked).toContainEqual({
        provider: "sofascore",
        path: sofascoreSquadPath(club.sofascoreTeamId),
      });
      expect(asked).toContainEqual({
        provider: "flashscore",
        path: flashscoreSquadPath(club.flashscoreTeamId),
      });
    }
    expect(result.requests).toEqual({
      sofascore: { sent: 3, failed: 0 },
      flashscore: { sent: 3, failed: 0 },
    });
    expect(result.squads).toHaveLength(6);
  });

  test("the squad paths avoid the endpoints already shown to 404", () => {
    const paths = CLUB_PROVIDER_TEAMS.flatMap((c) => [
      sofascoreSquadPath(c.sofascoreTeamId),
      flashscoreSquadPath(c.flashscoreTeamId),
    ]);
    for (const path of paths) expect(path).not.toMatch(/get-players|players\/info|teams\/players/);
  });

  test("the requested team is the membership context of every player", async () => {
    const result = await collectSquads({ fetchJson: healthyFetcher(), now: NOW, clubs });
    for (const squad of result.squads)
      for (const player of squad.players)
        expect(player.requestedTeamId).toBe(squad.requestedTeamId);
  });

  test("a healthy squad is COMPLETE and its players carry that state", async () => {
    const result = await collectSquads({ fetchJson: healthyFetcher(), now: NOW, clubs });
    for (const squad of result.squads) {
      expect(squad.completeness.state).toBe("COMPLETE");
      expect(squad.players.every((p) => p.squadCompleteness === "COMPLETE")).toBe(true);
    }
  });

  test("a short squad is INCOMPLETE_PROVIDER_SQUAD and its players say so; nothing about the club is hard-coded", async () => {
    const fetchJson: FetchJson = async (provider, path) =>
      provider === "flashscore" && path.includes(clubs[1]!.flashscoreTeamId)
        ? { status: 200, body: flashPayload(flashSquadEntries(16, "short")) }
        : healthyFetcher()(provider, path);
    const result = await collectSquads({ fetchJson, now: NOW, clubs });
    const short = result.squads.find(
      (s) => s.provider === "flashscore" && s.clubKey === clubs[1]!.clubKey,
    )!;
    expect(short.completeness.state).toBe("INCOMPLETE_PROVIDER_SQUAD");
    expect(short.players.every((p) => p.squadCompleteness === "INCOMPLETE_PROVIDER_SQUAD")).toBe(
      true,
    );
    expect(
      result.squads.filter((s) => s.completeness.state === "INCOMPLETE_PROVIDER_SQUAD"),
    ).toHaveLength(1);
  });

  test("a failed request is recorded with a stable code and no body, and the other requests still run", async () => {
    const fetchJson: FetchJson = async (provider, path) => {
      if (path.includes(String(clubs[0]!.sofascoreTeamId)))
        throw new Error("secret-bearing message");
      if (provider === "flashscore" && path.includes(clubs[1]!.flashscoreTeamId))
        return { status: 404, body: { detail: "x" } };
      return healthyFetcher()(provider, path);
    };
    const result = await collectSquads({ fetchJson, now: NOW, clubs });
    const thrown = result.squads.find(
      (s) => s.provider === "sofascore" && s.clubKey === clubs[0]!.clubKey,
    )!;
    const notFound = result.squads.find(
      (s) => s.provider === "flashscore" && s.clubKey === clubs[1]!.clubKey,
    )!;
    expect(thrown).toMatchObject({
      status: "fetch_failed",
      errorCode: "request_error",
      players: [],
    });
    expect(notFound).toMatchObject({ status: "fetch_failed", errorCode: "http_404", players: [] });
    expect(JSON.stringify(result)).not.toContain("secret-bearing");
    expect(result.requests.sofascore.failed).toBe(1);
    expect(result.requests.flashscore.failed).toBe(1);
    expect(result.squads.filter((s) => s.status === "ok")).toHaveLength(4);
  });

  test("a response that is not a squad is invalid_payload, with no players guessed", async () => {
    const result = await collectSquads({
      fetchJson: async () => ({ status: 200, body: { hello: "world" } }),
      now: NOW,
      clubs: clubs.slice(0, 1),
    });
    for (const squad of result.squads)
      expect(squad).toMatchObject({
        status: "invalid_payload",
        errorCode: "unexpected_shape",
        players: [],
      });
  });

  test("a provider id that appears in two clubs is reported for review", async () => {
    const fetchJson: FetchJson = async (provider) => ({
      status: 200,
      body:
        provider === "sofascore"
          ? sofaPayload(sofaSquadEntries(30, 5000))
          : flashPayload(flashSquadEntries(28, "z")),
    });
    const result = await collectSquads({ fetchJson, now: NOW, clubs: clubs.slice(0, 2) });
    expect(result.idChecks.conclusion).toBe("PROVIDER_ID_COLLISION_NEEDS_REVIEW");
    expect(result.idChecks.byProvider.sofascore.idsInMultipleClubs.length).toBe(30);
  });

  test("distinct ids across clubs: no collision observed", async () => {
    const result = await collectSquads({ fetchJson: healthyFetcher(), now: NOW, clubs });
    expect(result.idChecks.conclusion).toBe("NO_CURRENT_SNAPSHOT_COLLISION_OBSERVED");
  });
});

describe("read-only guarantee", () => {
  const sources = readdirSync(new URL(".", import.meta.url))
    .filter(
      (file) => file.endsWith(".ts") && !file.endsWith(".test.ts") && file !== "test-support.ts",
    )
    .map((file) => ({
      file,
      code: readFileSync(new URL(file, import.meta.url), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, ""),
    }));

  test("the collector sources have no database, file, network or console capability", () => {
    expect(sources.length).toBeGreaterThan(8);
    for (const { file, code } of sources) {
      for (const forbidden of [
        /supabase/i,
        /createClient/,
        /\.rpc\(/,
        /node:/,
        /\bfs\b/,
        /\bfetch\(/,
        /process\.env/,
        /console\./,
        /football_provider_mappings/,
        /\b(insert|update|delete|truncate|alter|drop)\s+(into|from|table|set)?\b/i,
        /\bSELECT\b/,
        /from "(?!\.\/)/,
      ])
        expect({ file, hit: forbidden.test(code) ? String(forbidden) : null }).toEqual({
          file,
          hit: null,
        });
    }
  });

  test("the only outside access is the injected fetchJson, which cannot choose a method or send a body", () => {
    const collector = sources.find((s) => s.file === "collector.ts")!.code;
    expect(collector).toContain(
      "export type FetchJson = (provider: ProviderName, pathAndQuery: string)",
    );
    expect((collector.match(/fetchJson\(/g) ?? []).length).toBe(1);
  });
});
