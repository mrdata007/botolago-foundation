import { describe, expect, it } from "bun:test";

import { selectPepitesDataMode } from "@/services/pepites";

import { PepitesError } from "./errors";
import { SupabasePepitesRepository } from "./supabase-repository";

type Result = { data: unknown; error: { code?: string; message?: string } | null };

function fakeApi(answer: (name: string, args: Record<string, unknown>) => Result) {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const api = {
    rpc(name: string, args: Record<string, unknown> = {}) {
      calls.push({ name, args });
      const result = Promise.resolve(answer(name, args));
      return Object.assign(result, { abortSignal: () => result });
    },
  };
  return { repository: new SupabasePepitesRepository(api as never), calls };
}

const context = { actorId: null, requestId: "test" };

describe("SupabasePepitesRepository", () => {
  it("reads a database without the Pépites functions as Pépites switched off", async () => {
    const { repository } = fakeApi(() => ({
      data: null,
      error: { code: "PGRST202", message: "Could not find the function" },
    }));
    expect(await repository.version(context)).toEqual({ available: false });
    expect(await repository.home(null, context)).toEqual({ available: false });
  });

  it("still fails loudly on anything else", async () => {
    const { repository } = fakeApi(() => ({
      data: null,
      error: { code: "57014", message: "timeout" },
    }));
    await expect(repository.version(context)).rejects.toBeInstanceOf(PepitesError);
  });

  it("asks for the current version by name and the current season by null", async () => {
    const { repository, calls } = fakeApi(() => ({ data: { available: false }, error: null }));
    await repository.player(null, "7e500000-0000-4000-8000-000000000001", context);
    await repository.edition(null, 16, context);
    expect(calls).toEqual([
      {
        name: "pepites_player",
        args: { p_version: "current", p_player_id: "7e500000-0000-4000-8000-000000000001" },
      },
      { name: "pepites_edition", args: { p_season_id: null, p_week: 16 } },
    ]);
  });

  it("refuses an answer that does not match the contract", async () => {
    const { repository } = fakeApi(() => ({ data: { available: "yes" }, error: null }));
    await expect(repository.version(context)).rejects.toMatchObject({ code: "data_unavailable" });
  });

  it("sends the ranking's new filters only when they are set", async () => {
    const { repository, calls } = fakeApi(() => ({ data: { available: false }, error: null }));
    const base = {
      version: null,
      position: null,
      maxAge: null,
      teamId: null,
      sort: "score" as const,
      limit: 20,
      offset: 0,
    };
    await repository.ranking(base, context);
    await repository.ranking({ ...base, minMinutes: 450, followed: true }, context);
    expect(calls[0]!.args).toMatchObject({ p_min_minutes: undefined, p_followed: undefined });
    expect(calls[1]!.args).toMatchObject({ p_min_minutes: 450, p_followed: true });
  });

  it("reads the season figures under a version, and the follow state by player", async () => {
    const player = "7e500000-0000-4000-8000-000000000001";
    const { repository, calls } = fakeApi((name) => ({
      data:
        name === "pepites_follow_state"
          ? { available: true, preview: false, found: true, followers: 3, following: null }
          : { available: false },
      error: null,
    }));
    await repository.playerStats(null, player, context);
    expect(await repository.followState(player, context)).toEqual({
      available: true,
      preview: false,
      found: true,
      followers: 3,
      following: null,
    });
    expect(calls).toEqual([
      { name: "pepites_player_stats", args: { p_version: "current", p_player_id: player } },
      { name: "pepites_follow_state", args: { p_player_id: player } },
    ]);
  });

  it("maps the follow refusals: a guest, the cap, a player it never assessed", async () => {
    for (const [message, code] of [
      ["PEPITES_ACCOUNT_REQUIRED", "account_required"],
      ["PEPITES_FOLLOW_LIMIT", "follow_limit"],
      ["PEPITES_PLAYER_NOT_FOUND", "not_found"],
      ["PEPITES_SIGN_IN_REQUIRED", "unauthenticated"],
    ] as const) {
      const { repository } = fakeApi(() => ({ data: null, error: { code: "PT403", message } }));
      await expect(
        repository.setFollow("7e500000-0000-4000-8000-000000000001", true, context),
      ).rejects.toMatchObject({ code });
    }
  });

  it("maps a report refused for the day's limit", async () => {
    const { repository } = fakeApi(() => ({
      data: null,
      error: { code: "PT429", message: "data_desk_rate_limited" },
    }));
    await expect(
      repository.reportDataIssue(
        "7e500000-0000-4000-8000-000000000001",
        "height_cm",
        "Faux",
        context,
      ),
    ).rejects.toMatchObject({ code: "rate_limited" });
  });
});

describe("selectPepitesDataMode", () => {
  it("demands the database in production", () => {
    expect(() => selectPepitesDataMode("mock", true)).toThrow();
    expect(selectPepitesDataMode("supabase", true)).toBe("supabase");
    expect(selectPepitesDataMode(undefined, false)).toBe("mock");
  });
});
