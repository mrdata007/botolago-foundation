import { describe, expect, it } from "bun:test";

import {
  managerCardHistoryPageSchema,
  managerCardResponseSchema,
  managerCardsResponseSchema,
} from "./contracts";
import { ManagerCardError, mapManagerCardError } from "./errors";
import {
  MANAGER_CARD_SAMPLE_NOTICE,
  MockManagerCardRepository,
  SAMPLE_CARDS,
  SAMPLE_HISTORY,
  SAMPLE_MY_CARD,
} from "./mock-repository";
import { SupabaseManagerCardRepository } from "./supabase-repository";

const context = { actorId: null, requestId: "test" };
const TEAM = "5a3b1e00-0000-4000-8000-000000000001";

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

describe("Manager Card contracts", () => {
  it("accepts the database's card, with null figures and no club", () => {
    const card = {
      ...SAMPLE_CARDS[2]!,
      serial: null,
      club: null,
    };
    expect(managerCardResponseSchema.parse(card)).toEqual(card);
    expect(managerCardResponseSchema.parse(null)).toBeNull();
  });

  it("rejects a figure outside 1-99, a malformed serial and an unknown tier", () => {
    expect(() => managerCardResponseSchema.parse({ ...SAMPLE_MY_CARD, ovr: 100 })).toThrow();
    expect(() =>
      managerCardResponseSchema.parse({ ...SAMPLE_MY_CARD, serial: "004821" }),
    ).toThrow();
    expect(() => managerCardResponseSchema.parse({ ...SAMPLE_MY_CARD, tier: "gold" })).toThrow();
  });

  it("drops a key the database should not send, such as a user id", () => {
    const parsed = managerCardResponseSchema.parse({
      ...SAMPLE_MY_CARD,
      userId: "00000000-0000-4000-8000-000000000001",
      email: "someone@example.test",
    });
    expect(parsed).not.toHaveProperty("userId");
    expect(parsed).not.toHaveProperty("email");
  });

  it("parses a batch and a history page", () => {
    expect(managerCardsResponseSchema.parse(SAMPLE_CARDS)).toHaveLength(SAMPLE_CARDS.length);
    expect(
      managerCardHistoryPageSchema.parse({ items: SAMPLE_HISTORY.slice(0, 2), nextAfter: 7 }),
    ).toMatchObject({ nextAfter: 7 });
    expect(() => managerCardHistoryPageSchema.parse({ items: [] })).toThrow();
  });
});

describe("mapManagerCardError", () => {
  it("maps the raised messages by exact equality", () => {
    expect(mapManagerCardError({ code: "PT403", message: "manager_card_off" }).code).toBe(
      "manager_card_off",
    );
    expect(mapManagerCardError({ code: "PT400", message: "validation_failed" }).code).toBe(
      "validation_failed",
    );
    expect(mapManagerCardError({ code: "PT401", message: "authentication_required" }).code).toBe(
      "unauthenticated",
    );
    // A message that merely contains a known code is not that code.
    expect(mapManagerCardError({ message: "xx manager_card_off xx" }).code).toBe(
      "data_unavailable",
    );
  });

  it("reads the step-up refusal, a missing function and a dead network", () => {
    expect(mapManagerCardError({ code: "PT403", message: "mfa_required" }).code).toBe(
      "mfa_required",
    );
    expect(mapManagerCardError({ code: "PGRST202", message: "no function" }).code).toBe(
      "manager_card_off",
    );
    const network = mapManagerCardError(new TypeError("Failed to fetch"));
    expect(network.code).toBe("network");
    expect(network.retryable).toBe(true);
    expect(mapManagerCardError({ code: "57014", message: "timeout" }).retryable).toBe(false);
  });

  it("returns an existing ManagerCardError as is", () => {
    const error = new ManagerCardError("validation_failed", "x");
    expect(mapManagerCardError(error)).toBe(error);
  });
});

describe("SupabaseManagerCardRepository", () => {
  it("calls the four reads by name", async () => {
    const { repository, calls } = fakeApi((name) => ({
      data:
        name === "get_manager_cards"
          ? []
          : name === "get_my_manager_card_history"
            ? { items: [], nextAfter: null }
            : null,
      error: null,
    }));
    expect(await repository.getMyCard(context)).toBeNull();
    expect(await repository.getCard(TEAM, context)).toBeNull();
    expect(await repository.getCards([TEAM], context)).toEqual([]);
    expect(await repository.getMyHistory({}, context)).toEqual({ items: [], nextAfter: null });
    expect(calls).toEqual([
      { name: "get_my_manager_card", args: undefined },
      { name: "get_manager_card", args: { p_fantasy_team_id: TEAM } },
      { name: "get_manager_cards", args: { p_fantasy_team_ids: [TEAM] } },
      {
        name: "get_my_manager_card_history",
        args: { p_after_gameweek_sequence: undefined, p_limit: 20 },
      },
    ]);
  });

  it("returns a parsed card", async () => {
    const { repository } = fakeApi(() => ({ data: SAMPLE_MY_CARD, error: null }));
    expect(await repository.getMyCard(context)).toEqual(SAMPLE_MY_CARD);
  });

  it("sends each team once and refuses more than 100 distinct teams before the call", async () => {
    const { repository, calls } = fakeApi(() => ({ data: [], error: null }));
    await repository.getCards([TEAM, TEAM], context);
    expect(calls[0]!.args).toEqual({ p_fantasy_team_ids: [TEAM] });
    const many = Array.from(
      { length: 101 },
      (_, i) => `5a3b1e00-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
    );
    await expect(repository.getCards(many, context)).rejects.toMatchObject({
      code: "validation_failed",
    });
    expect(calls).toHaveLength(1);
    expect(await repository.getCards([], context)).toEqual([]);
    expect(calls).toHaveLength(1);
  });

  it("keeps the history page size inside 1-50", async () => {
    const { repository, calls } = fakeApi(() => ({
      data: { items: [], nextAfter: null },
      error: null,
    }));
    await repository.getMyHistory({ limit: 500, afterGameweekSequence: 7 }, context);
    await repository.getMyHistory({ limit: 0 }, context);
    expect(calls[0]!.args).toEqual({ p_after_gameweek_sequence: 7, p_limit: 50 });
    expect(calls[1]!.args).toMatchObject({ p_limit: 1 });
  });

  it("maps the database's refusals", async () => {
    const off = fakeApi(() => ({
      data: null,
      error: { code: "PT403", message: "manager_card_off" },
    }));
    await expect(off.repository.getMyCard(context)).rejects.toMatchObject({
      code: "manager_card_off",
    });
    const visitor = fakeApi(() => ({
      data: null,
      error: { code: "PT401", message: "authentication_required" },
    }));
    await expect(visitor.repository.getCard(TEAM, context)).rejects.toMatchObject({
      code: "unauthenticated",
    });
  });

  it("refuses an answer that does not match the contract", async () => {
    const { repository } = fakeApi(() => ({
      data: { ...SAMPLE_MY_CARD, tier: "gold" },
      error: null,
    }));
    await expect(repository.getMyCard(context)).rejects.toMatchObject({ code: "data_unavailable" });
  });
});

describe("MockManagerCardRepository", () => {
  it("labels its data as a sample", () => {
    expect(MANAGER_CARD_SAMPLE_NOTICE).toContain("Sample");
    for (const card of SAMPLE_CARDS) expect(card.name + card.season.label).toContain("ample");
  });

  it("answers with cards that satisfy the contract", async () => {
    const repository = new MockManagerCardRepository();
    expect(managerCardResponseSchema.parse(await repository.getMyCard(context))).not.toBeNull();
    managerCardsResponseSchema.parse(
      await repository.getCards(
        SAMPLE_CARDS.map((c) => c.fantasyTeamId),
        context,
      ),
    );
  });

  it("returns a batch in the order asked, once each, leaving unknown teams out", async () => {
    const repository = new MockManagerCardRepository();
    const [a, b, c] = SAMPLE_CARDS;
    const cards = await repository.getCards(
      [
        c!.fantasyTeamId,
        "5a3b1e00-0000-4000-8000-0000000000ff",
        a!.fantasyTeamId,
        c!.fantasyTeamId,
        b!.fantasyTeamId,
      ],
      context,
    );
    expect(cards.map((card) => card.fantasyTeamId)).toEqual([
      c!.fantasyTeamId,
      a!.fantasyTeamId,
      b!.fantasyTeamId,
    ]);
    expect(await repository.getCard("5a3b1e00-0000-4000-8000-0000000000ff", context)).toBeNull();
  });

  it("pages the history by gameweek sequence, newest first", async () => {
    const repository = new MockManagerCardRepository();
    const first = await repository.getMyHistory({ limit: 4 }, context);
    expect(first.items.map((item) => item.gameweekSequence)).toEqual([9, 8, 7, 6]);
    expect(first.nextAfter).toBe(6);
    const last = await repository.getMyHistory({ limit: 10, afterGameweekSequence: 6 }, context);
    expect(last.items.map((item) => item.gameweekSequence)).toEqual([5, 4, 3, 2, 1]);
    expect(last.nextAfter).toBeNull();
    managerCardHistoryPageSchema.parse(first);
  });

  it("refuses like the database: switch off, signed out, bad arguments", async () => {
    await expect(
      new MockManagerCardRepository({ enabled: false }).getMyCard(context),
    ).rejects.toMatchObject({ code: "manager_card_off" });
    await expect(
      new MockManagerCardRepository({ signedIn: false }).getMyCard(context),
    ).rejects.toMatchObject({ code: "unauthenticated" });
    const repository = new MockManagerCardRepository();
    await expect(repository.getMyHistory({ limit: 51 }, context)).rejects.toMatchObject({
      code: "validation_failed",
    });
    await expect(
      repository.getCards(
        Array.from(
          { length: 101 },
          (_, i) => `5a3b1e00-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
        ),
        context,
      ),
    ).rejects.toMatchObject({ code: "validation_failed" });
  });
});
