import { describe, expect, it } from "bun:test";

import { ManagerCardError } from "@/backend/manager-card/errors";

import {
  SupabasePremiumRivalsRepository,
  initialsOf,
  isRivalsMember,
  leadChange,
  rivalsResponseSchema,
  roundVerdict,
  totalGap,
  weekResult,
} from "./rivals";
import { MockPremiumRivalsRepository } from "./rivals-mock";

/**
 * The answers below follow what migration 20261015130100 returns for the fixture of
 * supabase/tests/database/rivals.test.sql (A against B: 40 to 80 in GW3, totals 150 to 187, A led
 * before; A against C, who shares their history). They were written from the SQL by hand: no
 * database was available to dump them (the pgTAP file is the authority).
 */
const TEAM_B = "bc1f0000-0000-4000-8000-000000000402";
const TEAM_C = "bc1f0000-0000-4000-8000-000000000403";
const LEAGUE = { id: "bc1f0000-0000-4000-8000-000000000701", name: "Rivals league 1" };

const LAST_B = {
  seq: 3,
  name: "Gameweek 3",
  publishedAt: "2089-09-18T12:00:00+00:00",
  correctedAt: null,
  me: 40,
  rival: 80,
  meTotal: 150,
  rivalTotal: 187,
  leader: "rival",
  leaderBefore: "me",
};
const MEMBER = {
  available: true,
  locked: false,
  season: { id: "bc1f0000-0000-4000-8000-000000000005", label: "2089/90" },
  max: 3,
  notify: false,
  me: { name: "Amina Test", total: 150 },
  rivals: [
    {
      teamId: TEAM_B,
      name: "Brahim Test",
      position: 1,
      league: LEAGUE,
      historyVisible: false,
      last: LAST_B,
      tally: { played: 3, won: 1, lost: 2, tied: 0 },
      biggestWin: { seq: 1, me: 60, rival: 55, margin: 5 },
      weeks: [
        { seq: 1, me: 60, rival: 55 },
        { seq: 2, me: 50, rival: 52 },
        { seq: 3, me: 40, rival: 80 },
      ],
      captain: null,
      transfer: null,
    },
    {
      teamId: TEAM_C,
      name: "Chaimae Test",
      position: 2,
      league: LEAGUE,
      historyVisible: true,
      last: { ...LAST_B, rival: 45, rivalTotal: 155, leaderBefore: "tie" },
      tally: { played: 3, won: 0, lost: 1, tied: 2 },
      biggestWin: null,
      weeks: [{ seq: 3, me: 40, rival: 45 }],
      captain: { me: null, rival: null },
      transfer: { playerIn: "S. Idrissi", pending: true, gain: null },
    },
  ],
};

const context = { actorId: null, requestId: "test" };
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
  return { repository: new SupabasePremiumRivalsRepository(api as never), calls };
}

describe("rivals contract", () => {
  it("accepts the three shapes: off, locked (two keys, nothing else) and a member's board", () => {
    expect(rivalsResponseSchema.parse({ available: false })).toEqual({ available: false });
    expect(rivalsResponseSchema.parse({ available: true, locked: true })).toEqual({
      available: true,
      locked: true,
    });
    expect(() =>
      rivalsResponseSchema.parse({ available: true, locked: true, rivals: [] }),
    ).toThrow();
    const board = rivalsResponseSchema.parse(MEMBER);
    expect(isRivalsMember(board)).toBe(true);
  });

  it("refuses a board that is not the contract (a ninth key of a rival is data, a missing one is not)", () => {
    const broken = structuredClone(MEMBER) as typeof MEMBER & {
      rivals: Array<{ tally?: unknown }>;
    };
    delete broken.rivals[0]!.tally;
    expect(() => rivalsResponseSchema.parse(broken)).toThrow();
  });

  it("reads who won the journée, the gap and who took the lead", () => {
    const board = rivalsResponseSchema.parse(MEMBER);
    if (!isRivalsMember(board)) throw new Error("member");
    const [b, c] = board.rivals;
    expect(roundVerdict(b!.last)).toBe("lost");
    expect(roundVerdict(null)).toBeNull();
    expect(totalGap(b!.last)).toBe(-37);
    expect(totalGap(c!.last)).toBe(-5);
    const change = leadChange(board.rivals);
    expect(change?.rival.name).toBe("Brahim Test");
    expect(change?.to).toBe("rival");
    expect(change?.corrected).toBe(false);
    expect(leadChange([])).toBeNull();
  });

  it("counts a journée a friend has no result for as no result, not a loss", () => {
    expect(weekResult({ me: 40, rival: null })).toBeNull();
    expect(weekResult({ me: 40, rival: 40 })).toBe("t");
    expect(weekResult({ me: 41, rival: 40 })).toBe("w");
    expect(weekResult({ me: 39, rival: 40 })).toBe("l");
  });

  it("makes initials from a full name, in French and in Arabic", () => {
    expect(initialsOf("Sami Berrada")).toBe("SB");
    expect(initialsOf("Karim B.")).toBe("KB");
    expect(initialsOf("Yassine")).toBe("Y");
    expect(initialsOf("  ")).toBe("");
    expect(initialsOf("سامي برادة")).toBe("سب");
  });
});

describe("the Supabase repository", () => {
  it("sends every argument, nulls included, and parses the answer", async () => {
    const { repository, calls } = fakeApi(() => ({ data: MEMBER, error: null }));
    const answer = await repository.myRivals(context);
    expect(isRivalsMember(answer as never)).toBe(true);
    expect(calls).toEqual([{ name: "get_my_rivals", args: { p_season: null } }]);
  });

  it("reads a database the migration has not reached as off", async () => {
    const { repository } = fakeApi(() => ({
      data: null,
      error: { code: "PGRST202", message: "x" },
    }));
    expect(await repository.myRivals(context)).toEqual({ available: false });
  });

  it("maps a pin to its outcome: pinned, the cap (PT409), not a mate (PT404), off", async () => {
    const pinned = fakeApi(() => ({
      data: { available: true, locked: false, pinned: true, count: 2 },
      error: null,
    }));
    expect(await pinned.repository.pin(TEAM_B, context)).toEqual({ kind: "pinned", count: 2 });
    expect(pinned.calls[0]).toEqual({
      name: "pin_rival",
      args: { p_rival_team: TEAM_B, p_season: null },
    });
    const full = fakeApi(() => ({ data: null, error: { code: "PT409", message: "rivals_full" } }));
    expect(await full.repository.pin(TEAM_B, context)).toEqual({ kind: "full" });
    const stranger = fakeApi(() => ({
      data: null,
      error: { code: "PT404", message: "rival_not_found" },
    }));
    expect(await stranger.repository.pin(TEAM_B, context)).toEqual({ kind: "not_found" });
    const off = fakeApi(() => ({ data: { available: false }, error: null }));
    expect(await off.repository.pin(TEAM_B, context)).toEqual({ kind: "unavailable" });
  });

  it("lets any other failure through as the Manager Card's error", async () => {
    const { repository } = fakeApi(() => ({
      data: null,
      error: { code: "XX000", message: "boom" },
    }));
    await expect(repository.pin(TEAM_B, context)).rejects.toBeInstanceOf(ManagerCardError);
  });

  it("sets the notification and reads back the stored value (null when off or locked)", async () => {
    const on = fakeApi(() => ({
      data: { available: true, locked: false, notify: true },
      error: null,
    }));
    expect(await on.repository.setNotify(true, context)).toBe(true);
    expect(on.calls[0]).toEqual({ name: "set_rivals_notify", args: { p_enabled: true } });
    const locked = fakeApi(() => ({ data: { available: true, locked: true }, error: null }));
    expect(await locked.repository.setNotify(true, context)).toBeNull();
  });
});

describe("the development board", () => {
  it("is Karim B. 612 points, Sami 598 (7 won, 4 lost) and Yassine who took the lead (627)", async () => {
    const repo = new MockPremiumRivalsRepository();
    const answer = await repo.myRivals(context);
    if (!isRivalsMember(answer)) throw new Error("member");
    expect(answer.me).toEqual({ name: "Karim B.", total: 612 });
    const [sami, yassine] = answer.rivals;
    expect(sami!.name).toBe("Sami Berrada");
    expect(sami!.tally).toMatchObject({ won: 7, lost: 4, tied: 0 });
    expect(sami!.last).toMatchObject({ me: 62, rival: 58, meTotal: 612, rivalTotal: 598 });
    expect(sami!.biggestWin).toEqual({ seq: 9, me: 71, rival: 64, margin: 7 });
    expect(sami!.historyVisible).toBe(false);
    expect(sami!.captain).toBeNull();
    expect(yassine!.last).toMatchObject({
      rival: 79,
      rivalTotal: 627,
      leader: "rival",
      leaderBefore: "me",
    });
    expect(yassine!.tally).toMatchObject({ won: 5, lost: 6 });
    expect(yassine!.transfer).toEqual({ playerIn: "S. Idrissi", pending: true, gain: null });
  });

  it("pins up to three, refuses a fourth, unpins, and keeps the notification off until set", async () => {
    const repo = new MockPremiumRivalsRepository();
    const candidates = await repo.candidates(context);
    if (!candidates.available || candidates.locked) throw new Error("member");
    expect(candidates.candidates.map((c) => c.name)).toEqual(["Hamza Tazi", "Ali Fassi"]);
    const [hamza, ali] = candidates.candidates;
    expect(await repo.pin(hamza!.teamId, context)).toEqual({ kind: "pinned", count: 3 });
    expect(await repo.pin(ali!.teamId, context)).toEqual({ kind: "full" });
    expect(await repo.pin("nobody", context)).toEqual({ kind: "not_found" });
    await repo.unpin(hamza!.teamId, context);
    expect(await repo.pin(ali!.teamId, context)).toEqual({ kind: "pinned", count: 3 });
    const board = await repo.myRivals(context);
    if (!isRivalsMember(board)) throw new Error("member");
    expect(board.notify).toBe(false);
    expect(await repo.setNotify(true, context)).toBe(true);
  });
});
