import { describe, expect, it } from "bun:test";

import { ManagerCardError } from "@/backend/manager-card/errors";

import {
  SupabasePremiumCardReadsRepository,
  careerResponseSchema,
  duelResponseSchema,
  historyVisibilityResponseSchema,
  isCareerMember,
  isDuelMember,
} from "./card-reads";

/**
 * The samples below are real answers of migration 20261013100400, produced by running
 * supabase/tests/database/premium_card_reads.test.sql's fixture (the Manager Card fixture of
 * manager_card.test.sql) on a local PostgreSQL 16 and dumping the JSON the four functions return:
 * the career of member A after GW1, GW2, GW3 and GW5, the locked answer a non-member gets, the duel
 * of A against B who shows their history, and against C who does not.
 */
const CAREER: unknown = JSON.parse(
  '{"hero":{"tier":"champion","lastOvr":81,"firstOvr":80,"provisional":true,"lastGameweekSeq":5,"firstGameweekSeq":3},"weeks":[{"ovr":null,"raw":{"cap":null,"con":null,"sel":null,"trf":null},"chip":null,"tier":null,"score":60,"stats":{"cap":null,"con":null,"sel":null,"trf":null},"captain":{"hit":null,"name":"MCP 13","share":null,"points":12,"usedVice":false,"bestStarterPoints":12},"gameweekSeq":1,"provisional":false,"transferHit":4,"gameweekName":"Gameweek 1","gameweeksCounted":1},{"ovr":null,"raw":{"cap":null,"con":null,"sel":null,"trf":null},"chip":null,"tier":null,"score":55,"stats":{"cap":null,"con":null,"sel":null,"trf":null},"captain":{"hit":false,"name":"MCP 8","share":0.833333,"points":10,"usedVice":true,"bestStarterPoints":12},"gameweekSeq":2,"provisional":false,"transferHit":0,"gameweekName":"Gameweek 2","gameweeksCounted":2},{"ovr":80,"raw":{"cap":0.805556,"con":1.0,"sel":0.856623,"trf":1.0},"chip":null,"tier":"champion","score":60,"stats":{"cap":81,"con":99,"sel":86,"trf":55},"captain":{"hit":false,"name":"MCP 8","share":0.777778,"points":7,"usedVice":false,"bestStarterPoints":9},"gameweekSeq":3,"provisional":true,"transferHit":0,"gameweekName":"Gameweek 3","gameweeksCounted":3},{"ovr":81,"raw":{"cap":0.837037,"con":1.0,"sel":0.847013,"trf":1.0},"chip":"triple_captain","tier":"champion","score":80,"stats":{"cap":84,"con":99,"sel":85,"trf":55},"captain":{"hit":false,"name":"MCP 15","share":0.9,"points":9,"usedVice":false,"bestStarterPoints":10},"gameweekSeq":5,"provisional":true,"transferHit":0,"gameweekName":"Gameweek 5","gameweeksCounted":4}],"locked":false,"season":{"id":"bc0e0000-0000-4000-8000-000000000005","label":"2089/90"},"captain":{"hits":0,"averageShare":0.837037,"weeksCounted":3},"seasons":[{"ovr":81,"tier":"champion","label":"2089/90","stats":{"cap":84,"con":99,"sel":85,"trf":55},"bestTier":"champion","closedAt":null,"seasonId":"bc0e0000-0000-4000-8000-000000000005","provisional":true,"gameweeksCounted":4}],"available":true,"bestWeeks":[{"score":80,"captain":{"name":"MCP 15","points":9,"usedVice":false},"topHalf":true,"gameweekSeq":5},{"score":60,"captain":{"name":"MCP 13","points":12,"usedVice":false},"topHalf":true,"gameweekSeq":1},{"score":60,"captain":{"name":"MCP 8","points":7,"usedVice":false},"topHalf":true,"gameweekSeq":3}],"transfers":{"best":{"hit":2.0,"gain":3.0,"state":"counted","playerIn":"MCP 17","playerOut":"MCP 12","gameweekSeq":1},"items":[{"hit":2.0,"gain":-1.0,"state":"counted","playerIn":"MCP 16","playerOut":"MCP 7","gameweekSeq":1},{"hit":2.0,"gain":3.0,"state":"counted","playerIn":"MCP 17","playerOut":"MCP 12","gameweekSeq":1},{"hit":0.0,"gain":null,"state":"pending","playerIn":"MCP 18","playerOut":"MCP 14","gameweekSeq":3},{"hit":8.0,"gain":null,"state":"pending","playerIn":"MCP 12","playerOut":"MCP 11","gameweekSeq":5}],"worst":{"hit":2.0,"gain":-1.0,"state":"counted","playerIn":"MCP 16","playerOut":"MCP 7","gameweekSeq":1},"hitsPaid":4,"byGameweek":[{"gain":2.0,"transfers":2,"gameweekSeq":1}],"seasonGain":2.0,"averageGain":1.0},"worstWeeks":[{"score":55,"captain":{"name":"MCP 8","points":10,"usedVice":true},"topHalf":true,"gameweekSeq":2}]}',
);
const LOCKED: unknown = JSON.parse('{"locked":true,"available":true}');
const DUEL_VISIBLE: unknown = JSON.parse(
  '{"me":{"card":{"ovr":81,"club":{"id":"bc0e0000-0000-4000-8000-000000000006","city":null,"code":"MCC","name":{"ar":"MC Club","fr":"Club MC"},"slug":"manager-card-club-1","shortName":{"ar":"MC","fr":"Club FR"},"primaryColor":"#112233","secondaryColor":"#445566"},"name":"Amina Test","tier":"champion","stats":{"cap":84,"con":99,"sel":85,"trf":55},"serial":"274602","teamId":"bc0e0000-0000-4000-8000-000000000401","edition":"standard","minRated":3,"provisional":true,"ratingState":"provisional","seasonLabel":"2089/90","founderCohort":null,"gameweeksCounted":4,"firstRatedGameweekSeq":3},"teamId":"bc0e0000-0000-4000-8000-000000000401"},"weeks":[{"me":{"ovr":null,"tier":null,"score":60,"stats":{"cap":null,"con":null,"sel":null,"trf":null},"provisional":false},"winner":"tie","opponent":{"ovr":null,"tier":null,"score":60,"stats":{"cap":null,"con":null,"sel":null,"trf":null},"provisional":false},"gameweekSeq":1,"gameweekName":"Gameweek 1"},{"me":{"ovr":null,"tier":null,"score":55,"stats":{"cap":null,"con":null,"sel":null,"trf":null},"provisional":false},"winner":"me","opponent":{"ovr":null,"tier":null,"score":50,"stats":{"cap":null,"con":null,"sel":null,"trf":null},"provisional":false},"gameweekSeq":2,"gameweekName":"Gameweek 2"},{"me":{"ovr":80,"tier":"champion","score":60,"stats":{"cap":81,"con":99,"sel":86,"trf":55},"provisional":true},"winner":"opponent","opponent":{"ovr":null,"tier":null,"score":70,"stats":{"cap":null,"con":99,"sel":88,"trf":null},"provisional":false},"gameweekSeq":3,"gameweekName":"Gameweek 3"},{"me":{"ovr":81,"tier":"champion","score":80,"stats":{"cap":84,"con":99,"sel":85,"trf":55},"provisional":true},"winner":"me","opponent":{"ovr":54,"tier":"stade","score":40,"stats":{"cap":1,"con":75,"sel":86,"trf":null},"provisional":true},"gameweekSeq":5,"gameweekName":"Gameweek 5"}],"locked":false,"season":{"id":"bc0e0000-0000-4000-8000-000000000005","label":"2089/90"},"seasons":[{"label":"2089/90","seasonId":"bc0e0000-0000-4000-8000-000000000005"}],"summary":{"ties":1,"meWins":2,"played":4,"biggestWin":{"margin":40,"gameweekSeq":5},"biggestLoss":{"margin":10,"gameweekSeq":3},"opponentWins":1,"opponentBestCaptain":{"name":"MCP 13","points":12,"gameweekSeq":1}},"opponent":{"card":{"ovr":54,"club":{"id":"bc0e0000-0000-4000-8000-000000000007","city":null,"code":"MCD","name":{"ar":"اثنان","fr":"MC Deux"},"slug":"manager-card-club-2","shortName":{"ar":"اثنان","fr":"Deux FR"},"primaryColor":null,"secondaryColor":null},"name":"Brahim Test","tier":"stade","stats":{"cap":1,"con":75,"sel":86,"trf":null},"serial":"276716","teamId":"bc0e0000-0000-4000-8000-000000000402","edition":"standard","minRated":3,"provisional":true,"ratingState":"provisional","seasonLabel":"2089/90","founderCohort":null,"gameweeksCounted":4,"firstRatedGameweekSeq":5},"teamId":"bc0e0000-0000-4000-8000-000000000402","historyVisible":true},"available":true}',
);
const DUEL_HIDDEN: unknown = JSON.parse(
  '{"me":{"card":{"ovr":81,"club":{"id":"bc0e0000-0000-4000-8000-000000000006","city":null,"code":"MCC","name":{"ar":"MC Club","fr":"Club MC"},"slug":"manager-card-club-1","shortName":{"ar":"MC","fr":"Club FR"},"primaryColor":"#112233","secondaryColor":"#445566"},"name":"Amina Test","tier":"champion","stats":{"cap":84,"con":99,"sel":85,"trf":55},"serial":"274602","teamId":"bc0e0000-0000-4000-8000-000000000401","edition":"standard","minRated":3,"provisional":true,"ratingState":"provisional","seasonLabel":"2089/90","founderCohort":null,"gameweeksCounted":4,"firstRatedGameweekSeq":3},"teamId":"bc0e0000-0000-4000-8000-000000000401"},"weeks":[],"locked":false,"season":{"id":"bc0e0000-0000-4000-8000-000000000005","label":"2089/90"},"seasons":[{"label":"2089/90","seasonId":"bc0e0000-0000-4000-8000-000000000005"}],"summary":null,"opponent":{"card":{"ovr":55,"club":null,"name":"Chaimae Test","tier":"stade","stats":{"cap":83,"con":25,"sel":58,"trf":null},"serial":"457152","teamId":"bc0e0000-0000-4000-8000-000000000403","edition":"standard","minRated":3,"provisional":true,"ratingState":"provisional","seasonLabel":"2089/90","founderCohort":null,"gameweeksCounted":4,"firstRatedGameweekSeq":3},"teamId":"bc0e0000-0000-4000-8000-000000000403","historyVisible":false},"available":true}',
);
const VISIBILITY: unknown = JSON.parse('{"visible":true,"available":true}');

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
  return { repository: new SupabasePremiumCardReadsRepository(api as never), calls };
}

const context = { actorId: null, requestId: "test" };
const TEAM = "bc0e0000-0000-4000-8000-000000000402";
const missing: Result = {
  data: null,
  error: { code: "PGRST202", message: "Could not find the function" },
};

describe("career contract", () => {
  it("accepts the database's answer for a member, key for key", () => {
    const parsed = careerResponseSchema.parse(CAREER);
    expect(isCareerMember(parsed)).toBe(true);
    if (!isCareerMember(parsed)) return;
    expect(parsed.season?.label).toBe("2089/90");
    expect(parsed.hero).toMatchObject({ firstOvr: 80, lastOvr: 81, tier: "champion" });
    expect(parsed.weeks.map((week) => week.gameweekSeq)).toEqual([1, 2, 3, 5]);
    expect(parsed.weeks[0]!.ovr).toBeNull();
    expect(parsed.weeks[3]).toMatchObject({
      score: 80,
      ovr: 81,
      stats: { cap: 84, sel: 85, trf: 55, con: 99 },
    });
    expect(parsed.captain).toEqual({ weeksCounted: 3, hits: 0, averageShare: 0.837037 });
    expect(parsed.transfers.items.map((item) => item.state)).toEqual([
      "counted",
      "counted",
      "pending",
      "pending",
    ]);
    expect(parsed.transfers.averageGain).toBe(1);
    expect(parsed.transfers.best?.playerIn).toBe("MCP 17");
    expect(parsed.seasons).toHaveLength(1);
  });

  it("does not drop a key the database sends, at any depth", () => {
    // zod strips keys it does not know: a deep equal with the raw answer proves each is declared.
    expect(careerResponseSchema.parse(CAREER)).toEqual(CAREER as never);
    expect(duelResponseSchema.parse(DUEL_VISIBLE)).toEqual(DUEL_VISIBLE as never);
    expect(duelResponseSchema.parse(DUEL_HIDDEN)).toEqual(DUEL_HIDDEN as never);
  });

  it("reads a non-member as locked, with nothing else", () => {
    const parsed = careerResponseSchema.parse(LOCKED);
    expect(parsed).toEqual({ available: true, locked: true });
    expect(isCareerMember(parsed)).toBe(false);
    // A locked answer that carries data is refused: the lock is not a filter on the client.
    expect(() =>
      careerResponseSchema.parse({ available: true, locked: true, weeks: [] }),
    ).toThrow();
  });

  it("reads the feature switched off", () => {
    expect(careerResponseSchema.parse({ available: false })).toEqual({ available: false });
  });

  it("refuses a malformed member answer", () => {
    const broken = JSON.parse(JSON.stringify(CAREER));
    broken.weeks[0].tier = "diamond";
    expect(() => careerResponseSchema.parse(broken)).toThrow();
    const noTransfers = JSON.parse(JSON.stringify(CAREER));
    delete noTransfers.transfers;
    expect(() => careerResponseSchema.parse(noTransfers)).toThrow();
  });
});

describe("duel contract", () => {
  it("accepts a visible history: weeks, the summary and both cards", () => {
    const parsed = duelResponseSchema.parse(DUEL_VISIBLE);
    expect(isDuelMember(parsed)).toBe(true);
    if (!isDuelMember(parsed)) return;
    expect(parsed.opponent.historyVisible).toBe(true);
    expect(parsed.weeks.map((week) => week.winner)).toEqual(["tie", "me", "opponent", "me"]);
    expect(parsed.summary).toMatchObject({ played: 4, meWins: 2, opponentWins: 1, ties: 1 });
    expect(parsed.summary?.opponentBestCaptain).toEqual({
      gameweekSeq: 1,
      name: "MCP 13",
      points: 12,
    });
    expect(parsed.me.card?.edition).toBe("standard");
    expect(parsed.seasons).toHaveLength(1);
  });

  it("accepts a hidden history: only today's values, no weeks, no summary", () => {
    const parsed = duelResponseSchema.parse(DUEL_HIDDEN);
    expect(isDuelMember(parsed)).toBe(true);
    if (!isDuelMember(parsed)) return;
    expect(parsed.opponent.historyVisible).toBe(false);
    expect(parsed.weeks).toEqual([]);
    expect(parsed.summary).toBeNull();
    expect(parsed.opponent.card?.ovr).toBe(55);
  });

  it("reads a non-member as locked and the feature off as unavailable", () => {
    expect(duelResponseSchema.parse(LOCKED)).toEqual({ available: true, locked: true });
    expect(duelResponseSchema.parse({ available: false })).toEqual({ available: false });
  });
});

describe("privacy switch contract", () => {
  it("reads the value and the off answer", () => {
    expect(historyVisibilityResponseSchema.parse(VISIBILITY)).toEqual({
      available: true,
      visible: true,
    });
    expect(historyVisibilityResponseSchema.parse({ available: false })).toEqual({
      available: false,
    });
    expect(() => historyVisibilityResponseSchema.parse({ available: true })).toThrow();
  });
});

describe("SupabasePremiumCardReadsRepository", () => {
  it("reads a database the migration has not reached as the feature switched off", async () => {
    const { repository } = fakeApi(() => missing);
    expect(await repository.career(null, context)).toEqual({ available: false });
    expect(await repository.duel(TEAM, null, context)).toEqual({ available: false });
    expect(await repository.historyVisibility(context)).toEqual({ available: false });
    expect(await repository.setHistoryVisibility(true, context)).toEqual({ available: false });
  });

  it("calls each function by its name with the arguments of the migration, nulls sent", async () => {
    const { repository, calls } = fakeApi((name) => {
      if (name === "get_my_card_career") return { data: CAREER, error: null };
      if (name === "get_card_duel") return { data: DUEL_VISIBLE, error: null };
      return { data: VISIBILITY, error: null };
    });
    await repository.career(null, context);
    await repository.career("2089/90", context);
    await repository.duel(TEAM, null, context);
    await repository.duel(TEAM, "2088/89", context);
    await repository.setHistoryVisibility(false, context);
    await repository.historyVisibility(context);
    expect(calls).toEqual([
      { name: "get_my_card_career", args: { p_season: null } },
      { name: "get_my_card_career", args: { p_season: "2089/90" } },
      { name: "get_card_duel", args: { p_other_team: TEAM, p_season: null } },
      { name: "get_card_duel", args: { p_other_team: TEAM, p_season: "2088/89" } },
      { name: "set_card_history_visibility", args: { p_visible: false } },
      { name: "get_my_card_history_visibility", args: undefined },
    ]);
  });

  it("returns the typed answer", async () => {
    const { repository } = fakeApi(() => ({ data: CAREER, error: null }));
    const answer = await repository.career(null, context);
    expect(isCareerMember(answer) && answer.weeks.length).toBe(4);
  });

  it("maps a duel against a stranger to not_found, and anything else loudly", async () => {
    const notMate = fakeApi(() => ({
      data: null,
      error: { code: "PT404", message: "card_duel_not_found" },
    }));
    await expect(notMate.repository.duel(TEAM, null, context)).rejects.toMatchObject({
      code: "not_found",
    });
    const bad = fakeApi(() => ({ data: null, error: { code: "57014", message: "timeout" } }));
    await expect(bad.repository.career(null, context)).rejects.toBeInstanceOf(ManagerCardError);
    await expect(bad.repository.career(null, context)).rejects.toMatchObject({
      code: "data_unavailable",
    });
    const invalid = fakeApi(() => ({
      data: null,
      error: { code: "PT400", message: "validation_failed" },
    }));
    await expect(invalid.repository.career("nonsense", context)).rejects.toMatchObject({
      code: "invalid_request",
    });
  });

  it("refuses an answer that does not match the contract", async () => {
    const { repository } = fakeApi(() => ({ data: { available: "yes" }, error: null }));
    await expect(repository.career(null, context)).rejects.toMatchObject({
      code: "data_unavailable",
    });
    await expect(repository.duel(TEAM, null, context)).rejects.toMatchObject({
      code: "data_unavailable",
    });
  });
});
