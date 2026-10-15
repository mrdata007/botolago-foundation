import { describe, expect, it } from "bun:test";

import { ManagerCardError } from "@/backend/manager-card/errors";

import {
  SupabaseTrophiesRepository,
  chooseFrameResponseSchema,
  isTrophiesCabinet,
  leagueMemberTrophiesSchema,
  setVisibilityResponseSchema,
  trophiesResponseSchema,
} from "./contracts";
import { MockTrophiesRepository, mockTrophies } from "./mock";

/**
 * The sample below is an answer of `api.get_my_trophies` captured on a private rehearsal PostgreSQL 16
 * against stand-ins for the Manager Card helpers (the evaluator, then the read as a member, after a
 * correction that took the score and the rating away: the trophies were still there). It was edited by
 * hand for the owner's decisions of 2026-10-15, which came after the capture: the league podium is no
 * longer earned mid-season (it is progress, today's rank), the league trophy is « Champion de votre
 * ligue », and the answer carries `showToLeagues`. It is not the pgTAP fixture, which cannot run
 * without Docker here.
 */
const REAL: unknown = JSON.parse(
  '{"frame": "standard", "earned": [{"code": "first_rating", "facts": {"ovr": 62, "tier": "lastreet"}, "family": "paliers", "labelAr": "\u0623\u0648\u0644 \u062a\u0642\u064a\u064a\u0645", "labelFr": "Premi\u00e8re note", "earnedAt": "2026-10-15T08:34:14.804419+00:00", "seasonId": "00000000-0000-4000-8000-000000000001", "gameweekSeq": 3, "publishedAt": "2026-09-22T00:00:00+00:00"}, {"code": "first_stade", "facts": {"ovr": 70, "tier": "stade"}, "family": "paliers", "labelAr": "\u0623\u0648\u0644 \u0645\u0631\u0629 \u0641\u064a \u0645\u0633\u062a\u0648\u0649 \u0645\u0644\u0639\u0628", "labelFr": "Premier passage STADE", "earnedAt": "2026-10-15T08:34:14.804419+00:00", "seasonId": "00000000-0000-4000-8000-000000000001", "gameweekSeq": 8, "publishedAt": "2026-10-27T00:00:00+00:00"}, {"code": "gw_80", "facts": {"score": 81}, "family": "journees", "labelAr": "\u062c\u0648\u0644\u0629 \u0628\u0640 80 \u0646\u0642\u0637\u0629", "labelFr": "Journ\u00e9e \u00e0 80 pts", "earnedAt": "2026-10-15T08:34:14.804419+00:00", "seasonId": "00000000-0000-4000-8000-000000000001", "gameweekSeq": 8, "publishedAt": "2026-10-27T00:00:00+00:00"}, {"code": "ten_gameweeks", "facts": {"played": 10}, "family": "journees", "labelAr": "10 \u062c\u0648\u0644\u0627\u062a \u0644\u064f\u0639\u0628\u062a", "labelFr": "10 journ\u00e9es jou\u00e9es", "earnedAt": "2026-10-15T08:34:14.804419+00:00", "seasonId": "00000000-0000-4000-8000-000000000001", "gameweekSeq": 10, "publishedAt": "2026-11-10T00:00:00+00:00"}, {"code": "winning_transfer", "facts": {"gain": 11, "playerIn": "A. Chakir", "playerOut": "M. Tahiri"}, "family": "decisions", "labelAr": "\u0627\u0646\u062a\u0642\u0627\u0644 \u0631\u0627\u0628\u062d", "labelFr": "Transfert gagnant", "earnedAt": "2026-10-15T08:34:14.804419+00:00", "seasonId": "00000000-0000-4000-8000-000000000001", "gameweekSeq": 8, "publishedAt": "2026-11-10T00:00:00+00:00"}, {"code": "founder_2026", "facts": {"cohort": 1}, "family": "carte", "labelAr": "\u0645\u0624\u0633\u0633 2026", "labelFr": "Fondateur 2026", "earnedAt": "2026-10-15T08:34:14.804419+00:00", "seasonId": null, "gameweekSeq": null, "publishedAt": "2026-09-10T00:00:00+00:00"}], "frames": [{"code": "standard", "earned": true, "labelAr": "\u0639\u0627\u062f\u064a", "labelFr": "Standard", "trophyCode": null}, {"code": "founder_2026", "earned": true, "labelAr": "\u0645\u0624\u0633\u0633 2026", "labelFr": "Fondateur 2026", "trophyCode": "founder_2026"}, {"code": "first_stade", "earned": true, "labelAr": "\u0645\u0644\u0639\u0628", "labelFr": "STADE", "trophyCode": "first_stade"}, {"code": "first_pro", "earned": false, "labelAr": "\u0645\u062d\u062a\u0631\u0641", "labelFr": "PRO", "trophyCode": "first_pro"}, {"code": "first_champion", "earned": false, "labelAr": "\u0628\u0637\u0644", "labelFr": "CHAMPION", "trophyCode": "first_champion"}, {"code": "first_legend", "earned": false, "labelAr": "\u0623\u0633\u0637\u0648\u0631\u0629", "labelFr": "LEGEND", "trophyCode": "first_legend"}, {"code": "winning_transfer", "earned": true, "labelAr": "\u0627\u0646\u062a\u0642\u0627\u0644 \u0631\u0627\u0628\u062d", "labelFr": "Transfert gagnant", "trophyCode": "winning_transfer"}, {"code": "ten_gameweeks", "earned": true, "labelAr": "10 \u062c\u0648\u0644\u0627\u062a", "labelFr": "10 journ\u00e9es", "trophyCode": "ten_gameweeks"}, {"code": "thirty_gameweeks", "earned": false, "labelAr": "30 \u062c\u0648\u0644\u0629", "labelFr": "30 journ\u00e9es", "trophyCode": "thirty_gameweeks"}], "member": true, "season": {"id": "00000000-0000-4000-8000-000000000001", "label": "2026/27"}, "catalog": [{"code": "first_rating", "need": null, "scope": "season", "family": "paliers", "labelAr": "\u0623\u0648\u0644 \u062a\u0642\u064a\u064a\u0645", "labelFr": "Premi\u00e8re note"}, {"code": "first_stade", "need": null, "scope": "season", "family": "paliers", "labelAr": "\u0623\u0648\u0644 \u0645\u0631\u0629 \u0641\u064a \u0645\u0633\u062a\u0648\u0649 \u0645\u0644\u0639\u0628", "labelFr": "Premier passage STADE"}, {"code": "first_pro", "need": null, "scope": "season", "family": "paliers", "labelAr": "\u0623\u0648\u0644 \u0645\u0631\u0629 \u0641\u064a \u0645\u0633\u062a\u0648\u0649 \u0645\u062d\u062a\u0631\u0641", "labelFr": "Premier passage PRO"}, {"code": "first_champion", "need": null, "scope": "season", "family": "paliers", "labelAr": "\u0623\u0648\u0644 \u0645\u0631\u0629 \u0641\u064a \u0645\u0633\u062a\u0648\u0649 \u0628\u0637\u0644", "labelFr": "Premier passage CHAMPION"}, {"code": "first_legend", "need": null, "scope": "season", "family": "paliers", "labelAr": "\u0623\u0648\u0644 \u0645\u0631\u0629 \u0641\u064a \u0645\u0633\u062a\u0648\u0649 \u0623\u0633\u0637\u0648\u0631\u0629", "labelFr": "Premier passage LEGEND"}, {"code": "gw_80", "need": 80, "scope": "season", "family": "journees", "labelAr": "\u062c\u0648\u0644\u0629 \u0628\u0640 80 \u0646\u0642\u0637\u0629", "labelFr": "Journ\u00e9e \u00e0 80 pts"}, {"code": "ten_gameweeks", "need": 10, "scope": "season", "family": "journees", "labelAr": "10 \u062c\u0648\u0644\u0627\u062a \u0644\u064f\u0639\u0628\u062a", "labelFr": "10 journ\u00e9es jou\u00e9es"}, {"code": "thirty_gameweeks", "need": 30, "scope": "season", "family": "journees", "labelAr": "30 \u062c\u0648\u0644\u0629 \u0644\u064f\u0639\u0628\u062a", "labelFr": "30 journ\u00e9es jou\u00e9es"}, {"code": "winning_transfer", "need": 10, "scope": "season", "family": "decisions", "labelAr": "\u0627\u0646\u062a\u0642\u0627\u0644 \u0631\u0627\u0628\u062d", "labelFr": "Transfert gagnant"}, {"code": "league_podium", "need": 3, "scope": "season", "family": "ligue", "labelAr": "\u0645\u0646\u0635\u0629 \u0627\u0644\u062f\u0648\u0631\u064a", "labelFr": "Podium de la ligue"}, {"code": "league_leader", "need": 1, "scope": "season", "family": "ligue", "labelAr": "\u0628\u0637\u0644 \u062f\u0648\u0631\u064a\u0643", "labelFr": "Champion de votre ligue"}, {"code": "founder_2026", "need": null, "scope": "card", "family": "carte", "labelAr": "\u0645\u0624\u0633\u0633 2026", "labelFr": "Fondateur 2026"}], "pending": [], "progress": [{"code": "first_pro", "have": null, "need": 84, "unit": "rating"}, {"code": "first_champion", "have": null, "need": 90, "unit": "rating"}, {"code": "first_legend", "have": null, "need": 95, "unit": "rating"}, {"code": "thirty_gameweeks", "have": 11, "need": 30, "unit": "gameweeks"}, {"code": "league_podium", "have": 2, "need": 3, "unit": "rank"}, {"code": "league_leader", "have": 2, "need": 1, "unit": "rank"}], "available": true, "chosenFrame": "standard", "journeesPlayed": 11, "showToLeagues": true}',
);

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
  return { api: api as never, calls };
}
const context = { actorId: "u", requestId: "r" };

describe("the Trophées contract", () => {
  it("parses a real member answer key for key", () => {
    const parsed = trophiesResponseSchema.parse(REAL);
    if (!isTrophiesCabinet(parsed)) throw new Error("not a cabinet");
    expect(parsed.member).toBe(true);
    expect(parsed.earned.map((e) => e.code)).toEqual([
      "first_rating",
      "first_stade",
      "gw_80",
      "ten_gameweeks",
      "winning_transfer",
      "founder_2026",
    ]);
    // league trophies are given at the end of the season: never earned here, only progress
    expect(parsed.earned.some((e) => e.family === "ligue")).toBe(false);
    expect(parsed.progress.find((p) => p.code === "league_podium")).toEqual({
      code: "league_podium",
      have: 2,
      need: 3,
      unit: "rank",
    });
    expect(parsed.showToLeagues).toBe(true);
    // the figure that earned a trophy is kept as it was, and has a publication stamp
    const transfer = parsed.earned.find((e) => e.code === "winning_transfer")!;
    expect(transfer.facts).toEqual({ gain: 11, playerIn: "A. Chakir", playerOut: "M. Tahiri" });
    expect(parsed.earned.every((e) => e.publishedAt.length > 0)).toBe(true);
    expect(parsed.catalog).toHaveLength(12);
    expect(parsed.frames[0]).toMatchObject({ code: "standard", earned: true });
    expect(parsed.progress.find((p) => p.code === "thirty_gameweeks")).toEqual({
      code: "thirty_gameweeks",
      have: 11,
      need: 30,
      unit: "gameweeks",
    });
  });

  it("has no withdrawn state anywhere", () => {
    expect(JSON.stringify(REAL)).not.toMatch(/withdrawn|retire/i);
  });

  it("reads off, and refuses an answer that is neither", () => {
    expect(trophiesResponseSchema.parse({ available: false })).toEqual({ available: false });
    expect(chooseFrameResponseSchema.parse({ available: false })).toEqual({ available: false });
    expect(() => trophiesResponseSchema.parse({ available: true })).toThrow();
  });

  it("sends the full argument list and maps a missing function to off", async () => {
    const ok = fakeApi(() => ({ data: REAL, error: null }));
    const repo = new SupabaseTrophiesRepository(ok.api);
    expect(isTrophiesCabinet(await repo.myTrophies(null, context))).toBe(true);
    expect(ok.calls[0]).toEqual({ name: "get_my_trophies", args: { p_season: null } });
    await repo.chooseFrame("founder_2026", context).catch(() => undefined);
    expect(ok.calls[1]).toEqual({ name: "choose_card_frame", args: { p_code: "founder_2026" } });

    const missing = fakeApi(() => ({ data: null, error: { code: "PGRST202", message: "no" } }));
    expect(await new SupabaseTrophiesRepository(missing.api).myTrophies(null, context)).toEqual({
      available: false,
    });
  });

  it("surfaces a refused frame as an error, not as off", async () => {
    const refused = fakeApi(() => ({
      data: null,
      error: { code: "PT403", message: "premium_required" },
    }));
    await expect(
      new SupabaseTrophiesRepository(refused.api).chooseFrame("first_pro", context),
    ).rejects.toBeInstanceOf(ManagerCardError);
  });
});

describe("visibility and the league mates' trophies", () => {
  const MATES = {
    available: true,
    leagueId: "00000000-0000-4000-8000-0000000000a1",
    members: [
      {
        teamId: "00000000-0000-4000-8000-0000000000b2",
        count: 1,
        trophies: [
          {
            code: "league_podium",
            family: "ligue",
            labelFr: "Podium de la ligue",
            labelAr: "منصة الدوري",
            gameweekSeq: 34,
            publishedAt: "2027-05-30T09:00:00+00:00",
          },
        ],
      },
    ],
  };

  it("parses the mates read, which carries the trophies and nothing about points or ratings", () => {
    const parsed = leagueMemberTrophiesSchema.parse(MATES);
    if (!parsed.available) throw new Error("off");
    expect(parsed.members[0]!.count).toBe(1);
    expect(Object.keys(parsed.members[0]!.trophies[0]!).sort()).toEqual([
      "code",
      "family",
      "gameweekSeq",
      "labelAr",
      "labelFr",
      "publishedAt",
    ]);
    expect(leagueMemberTrophiesSchema.parse({ available: false })).toEqual({ available: false });
    // a mate with no trophy is not listed at all
    expect(() =>
      leagueMemberTrophiesSchema.parse({
        ...MATES,
        members: [{ teamId: "t", count: 0, trophies: [] }],
      }),
    ).toThrow();
  });

  it("sends the league and the switch value under the function's argument names", async () => {
    const api = fakeApi((name) => ({
      data: name === "set_trophies_visibility" ? { available: true, showToLeagues: false } : MATES,
      error: null,
    }));
    const repo = new SupabaseTrophiesRepository(api.api);
    expect(await repo.setVisibility(false, context)).toEqual({
      available: true,
      showToLeagues: false,
    });
    expect(api.calls[0]).toEqual({ name: "set_trophies_visibility", args: { p_visible: false } });
    const mates = await repo.leagueMemberTrophies(MATES.leagueId, context);
    expect(mates.available).toBe(true);
    expect(api.calls[1]).toEqual({
      name: "get_league_member_trophies",
      args: { p_league: MATES.leagueId },
    });
    expect(setVisibilityResponseSchema.parse({ available: false })).toEqual({ available: false });
  });

  it("surfaces a league that is not the caller's as an error, not as an empty list", async () => {
    const refused = fakeApi(() => ({
      data: null,
      error: { code: "PT404", message: "league_not_found" },
    }));
    await expect(
      new SupabaseTrophiesRepository(refused.api).leagueMemberTrophies(MATES.leagueId, context),
    ).rejects.toBeInstanceOf(ManagerCardError);
  });

  it("serves the development mates through the mock, following the switch", async () => {
    const repo = new MockTrophiesRepository();
    const shown = await repo.leagueMemberTrophies("lg1", context);
    if (!shown.available) throw new Error("off");
    expect(shown.members.map((m) => m.teamId)).toEqual(["m1", "m2"]);
    expect(shown.members.every((m) => m.count === m.trophies.length)).toBe(true);
    expect(JSON.stringify(shown)).not.toMatch(/ovr|score|tier|points/i);
  });
});

describe("the development cabinet", () => {
  it("is Karim B.'s: six earned, no league trophy before the season ends, no serial and no 'provisoire'", () => {
    const cabinet = mockTrophies("founder_2026", true);
    expect(cabinet.earned).toHaveLength(6);
    expect(cabinet.earned.some((e) => e.family === "ligue")).toBe(false);
    expect(cabinet.pending).toEqual([]);
    expect(cabinet.progress.find((p) => p.code === "league_podium")).toMatchObject({
      have: 3,
      unit: "rank",
    });
    expect(cabinet.showToLeagues).toBe(true);
    const json = JSON.stringify(cabinet);
    expect(json).not.toMatch(/provisoire|482913|serial/i);
  });

  it("shows standard to a non-member whatever was chosen", () => {
    expect(mockTrophies("first_stade", false).frame).toBe("standard");
    expect(mockTrophies("first_stade", true).frame).toBe("first_stade");
  });

  it("refuses a frame that has not been earned", async () => {
    await expect(new MockTrophiesRepository().chooseFrame("first_pro", context)).rejects.toThrow();
  });
});
