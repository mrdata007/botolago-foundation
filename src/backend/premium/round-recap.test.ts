import { describe, expect, it } from "bun:test";

import {
  EXAMPLE_RECAP_J10,
  EXAMPLE_RECAP_J11,
  EXAMPLE_RECAP_VIEW,
} from "@/components/plus/plus-recap-example";
import { ManagerCardError } from "@/backend/manager-card/errors";

import { MockPremiumRoundRecapRepository } from "./round-recap-mock";
import {
  SupabasePremiumRoundRecapRepository,
  isRoundRecapMember,
  recapResponseSchema,
  toRoundRecapView,
} from "./round-recap";

const context = { actorId: null, requestId: "test" };
const GW = "00000000-0000-4000-8000-000000000999";
const LEAGUE = "00000000-0000-4000-8000-000000000701";

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
  return { repository: new SupabasePremiumRoundRecapRepository(api as never), calls };
}

describe("round recap contract", () => {
  it("accepts the member answers, key for key, at any depth", () => {
    // zod strips keys it does not know: a deep equal with the raw answer proves each is declared.
    for (const sample of [EXAMPLE_RECAP_J11, EXAMPLE_RECAP_J10]) {
      expect(recapResponseSchema.parse(sample)).toEqual(sample as never);
    }
  });

  it("reads the four shapes in order: off, locked, empty, member", () => {
    expect(recapResponseSchema.parse({ available: false })).toEqual({ available: false });
    const locked = recapResponseSchema.parse({ available: true, locked: true });
    expect(locked).toEqual({ available: true, locked: true });
    expect(isRoundRecapMember(locked)).toBe(false);
    const empty = recapResponseSchema.parse({
      available: true,
      locked: false,
      gameweek: null,
      gameweeks: [],
    });
    expect(isRoundRecapMember(empty)).toBe(false);
    expect(isRoundRecapMember(recapResponseSchema.parse(EXAMPLE_RECAP_J11))).toBe(true);
  });

  it("refuses a locked answer that carries data: the lock is not a filter on the client", () => {
    expect(() =>
      recapResponseSchema.parse({
        available: true,
        locked: true,
        gameweek: EXAMPLE_RECAP_J11.gameweek,
      }),
    ).toThrow();
  });

  it("refuses a points figure that is not a whole number and a rating-like string", () => {
    const bad = {
      ...EXAMPLE_RECAP_J11,
      players: EXAMPLE_RECAP_J11.players.map((p, i) => (i === 0 ? { ...p, points: "5" } : p)),
    };
    expect(() => recapResponseSchema.parse(bad)).toThrow();
  });
});

describe("the view the screen draws from", () => {
  const view = toRoundRecapView(EXAMPLE_RECAP_J11);

  it("puts the eleven on the pitch from the attack down to the goalkeeper", () => {
    expect(view.pitch.map((line) => [line.row, line.chips.length])).toEqual([
      ["FWD", 3],
      ["MID", 4],
      ["DEF", 3],
      ["GK", 1],
    ]);
    expect(view.pitch[0]!.chips.map((chip) => chip.name)).toEqual([
      "Haddad",
      "Bouly Sambou",
      "Malango",
    ]);
  });

  it("gives each chip its cause: the captain, the transfer, the rest", () => {
    const byName = Object.fromEntries(
      view.pitch.flatMap((line) => line.chips).map((chip) => [chip.name, chip.cause]),
    );
    expect(byName["Bouly Sambou"]).toBe("captain");
    expect(byName["El Moutaraji"]).toBe("transfer");
    expect(byName["Haddad"]).toBe("others");
    expect(Object.values(byName).filter((cause) => cause === "others")).toHaveLength(9);
  });

  it("keeps a player with no published points pending, with no number", () => {
    const nanah = view.pitch
      .flatMap((line) => line.chips)
      .find((chip) => chip.name === "Ayoub Nanah")!;
    expect(nanah.pending).toBe(true);
    expect(nanah.points).toBeNull();
    expect(view.pendingPlayers).toBe(1);
    expect(view.settled).toBe(false);
  });

  it("lists the bench apart, in its order, with the minutes of a player who did not play", () => {
    expect(view.bench.map((player) => player.name)).toEqual([
      "Aziz Boura",
      "Youssef Mehri",
      "Zouhir Laâroubi",
    ]);
    expect(view.bench[2]).toMatchObject({ points: 0, minutes: 0, played: false });
  });

  it("checks that the parts add up before a breakdown is shown", () => {
    expect(view.reconciled).toBe(true);
    expect(view.score).toBe(75);
    expect(view.vsLeague).toBe(9);
    // 9 on the league = captain 3 + transfer -1 + the rest 7.
    expect(view.captain!.vsLeague! + view.transfersNet! + view.others!).toBe(view.vsLeague!);
    const off = toRoundRecapView({
      ...EXAMPLE_RECAP_J11,
      me: { ...EXAMPLE_RECAP_J11.me, score: 80 },
    });
    expect(off.reconciled).toBe(false);
  });

  it("is the example the locked screen blurs", () => {
    expect(EXAMPLE_RECAP_VIEW).toEqual(view);
    expect(toRoundRecapView(EXAMPLE_RECAP_J10).settled).toBe(true);
  });
});

describe("MockPremiumRoundRecapRepository", () => {
  it("serves journée 11 by default and journée 10 when asked", async () => {
    const mock = new MockPremiumRoundRecapRepository();
    const latest = await mock.roundRecap({}, context);
    expect(isRoundRecapMember(latest) && latest.gameweek.seq).toBe(11);
    const ten = await mock.roundRecap({ gameweek: EXAMPLE_RECAP_J10.gameweek.id }, context);
    expect(isRoundRecapMember(ten) && ten.gameweek.seq).toBe(10);
  });
});

describe("SupabasePremiumRoundRecapRepository", () => {
  it("reads a database the migration has not reached as the feature switched off", async () => {
    const { repository } = fakeApi(() => ({
      data: null,
      error: { code: "PGRST202", message: "Could not find the function" },
    }));
    expect(await repository.roundRecap({}, context)).toEqual({ available: false });
  });

  it("calls the function by its name with the arguments of the migration, nulls sent", async () => {
    const { repository, calls } = fakeApi(() => ({ data: EXAMPLE_RECAP_J11, error: null }));
    await repository.roundRecap({}, context);
    await repository.roundRecap({ gameweek: GW, league: LEAGUE }, context);
    expect(calls).toEqual([
      { name: "get_round_recap", args: { p_gameweek: null, p_league: null } },
      { name: "get_round_recap", args: { p_gameweek: GW, p_league: LEAGUE } },
    ]);
  });

  it("maps a journée or league that is not the caller's to not_found, with no hint why", async () => {
    const { repository } = fakeApi(() => ({
      data: null,
      error: { code: "PT404", message: "round_recap_not_found" },
    }));
    const error = await repository.roundRecap({ gameweek: GW }, context).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ManagerCardError);
    expect((error as ManagerCardError).code).toBe("not_found");
  });

  it("refuses an answer of the wrong shape as unavailable data", async () => {
    const { repository } = fakeApi(() => ({
      data: { available: true, locked: false },
      error: null,
    }));
    const error = await repository.roundRecap({}, context).catch((e: unknown) => e);
    expect((error as ManagerCardError).code).toBe("data_unavailable");
  });
});
