import { describe, expect, it } from "bun:test";

import { MAX_ACK_KEYS, MAX_CARDS_PER_READ } from "./contracts";
import { ManagerCardError } from "./errors";
import { FIXTURES } from "./fixtures";
import { OFF_STATUS, SupabaseManagerCardRepository } from "./supabase-repository";

type Result = { data: unknown; error: { code?: string; message?: string } | null };

function fakeApi(answer: (name: string, args: Record<string, unknown>) => Result) {
  const calls: Array<{ name: string; args: Record<string, unknown> | undefined }> = [];
  const api = {
    rpc(name: string, args?: Record<string, unknown>) {
      calls.push({ name, args });
      const result = Promise.resolve(answer(name, args ?? {}));
      return Object.assign(result, { abortSignal: () => result });
    },
  };
  return { repository: new SupabaseManagerCardRepository(api as never), calls };
}

const context = { actorId: null, requestId: "test" };
const missing: Result = {
  data: null,
  error: { code: "PGRST202", message: "Could not find the function" },
};

describe("SupabaseManagerCardRepository", () => {
  it("reads a database the Manager Card migrations have not reached as the section switched off", async () => {
    const { repository } = fakeApi(() => missing);
    expect(await repository.status(context)).toEqual(OFF_STATUS);
    expect(await repository.myCard(context)).toEqual({ available: false });
    expect(await repository.cards(["3c000004-0000-4000-8000-000000000001"], context)).toEqual({
      available: false,
    });
    expect(
      await repository.myHistory({ seasonId: null, beforeSeq: null, limit: 20 }, context),
    ).toEqual({ available: false });
  });

  it("still fails loudly on anything else", async () => {
    const { repository } = fakeApi(() => ({
      data: null,
      error: { code: "57014", message: "timeout" },
    }));
    await expect(repository.myCard(context)).rejects.toBeInstanceOf(ManagerCardError);
    await expect(repository.myCard(context)).rejects.toMatchObject({ code: "data_unavailable" });
  });

  it("calls each function by its name, with the arguments the plan names", async () => {
    const { repository, calls } = fakeApi((name) => {
      if (name === "manager_card_status") return { data: FIXTURES.rated.status, error: null };
      if (name === "get_my_manager_card")
        return { data: { available: true, card: FIXTURES.rated.card }, error: null };
      if (name === "get_manager_cards")
        return { data: { available: true, cards: FIXTURES.rated.league!.members }, error: null };
      if (name === "get_my_manager_card_history")
        return { data: { available: true, items: [], nextBeforeSeq: null }, error: null };
      return { data: { acknowledged: ["card_created"], ignored: [] }, error: null };
    });
    await repository.status(context);
    await repository.myCard(context);
    await repository.cards(["a", "b", "a"], context);
    await repository.myHistory({ seasonId: null, beforeSeq: null, limit: 20 }, context);
    await repository.myHistory({ seasonId: "s", beforeSeq: 7, limit: 20 }, context);
    await repository.ackMoments(["card_created", "card_created"], context);
    expect(calls).toEqual([
      { name: "manager_card_status", args: undefined },
      { name: "get_my_manager_card", args: undefined },
      { name: "get_manager_cards", args: { p_team_ids: ["a", "b"] } },
      {
        name: "get_my_manager_card_history",
        args: { p_season_id: null, p_before_seq: null, p_limit: 20 },
      },
      {
        name: "get_my_manager_card_history",
        args: { p_season_id: "s", p_before_seq: 7, p_limit: 20 },
      },
      { name: "ack_manager_card_moments", args: { p_keys: ["card_created"] } },
    ]);
  });

  it("returns the typed answer", async () => {
    const { repository } = fakeApi(() => ({
      data: { available: true, card: FIXTURES.rated.card },
      error: null,
    }));
    const answer = await repository.myCard(context);
    expect(answer.available && answer.card?.ovr).toBe(84);
  });

  it("reads a batch of teams in chunks of 100 and joins them", async () => {
    const ids = Array.from({ length: 230 }, (_, i) => `id-${i}`);
    const { repository, calls } = fakeApi((_name, args) => ({
      data: {
        available: true,
        cards: (args.p_team_ids as string[]).map((id) => ({
          ...FIXTURES.rated.league!.members[0]!,
          teamId: `3c000004-0000-4000-8000-${String(ids.indexOf(id)).padStart(12, "0")}`,
        })),
      },
      error: null,
    }));
    const answer = await repository.cards(ids, context);
    expect(calls.map((call) => (call.args!.p_team_ids as string[]).length)).toEqual([100, 100, 30]);
    expect(MAX_CARDS_PER_READ).toBe(100);
    expect(answer.available && answer.cards).toHaveLength(230);
  });

  it("makes no call for no teams and no keys", async () => {
    const { repository, calls } = fakeApi(() => missing);
    expect(await repository.cards([], context)).toEqual({ available: true, cards: [] });
    expect(await repository.ackMoments([], context)).toEqual({ acknowledged: [], ignored: [] });
    expect(calls).toEqual([]);
  });

  it("refuses more than 16 keys in one acknowledgement, before any call", async () => {
    const { repository, calls } = fakeApi(() => missing);
    const keys = Array.from({ length: MAX_ACK_KEYS + 1 }, (_, i) => `first_rating:${i}`);
    await expect(repository.ackMoments(keys, context)).rejects.toMatchObject({
      code: "invalid_request",
    });
    expect(calls).toEqual([]);
  });

  it("refuses an answer that does not match the contract", async () => {
    const { repository } = fakeApi(() => ({ data: { available: "yes" }, error: null }));
    await expect(repository.myCard(context)).rejects.toMatchObject({ code: "data_unavailable" });
    const bad = fakeApi(() => ({
      data: { available: true, card: { ...FIXTURES.rated.card, serial: "012345" } },
      error: null,
    }));
    await expect(bad.repository.myCard(context)).rejects.toMatchObject({
      code: "data_unavailable",
    });
  });
});
