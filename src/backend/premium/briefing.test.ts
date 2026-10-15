import { describe, expect, it } from "bun:test";

import { ManagerCardError } from "@/backend/manager-card/errors";
import { exampleAlternatives, exampleBriefing } from "@/components/plus/plus-briefing-example";

import {
  SupabasePremiumBriefingRepository,
  alternativesResponseSchema,
  briefingResponseSchema,
  isAlternativesMember,
  isBriefingMember,
} from "./briefing";

/**
 * The two samples below are real answers of migration 20261015140000, produced by running its SQL
 * on a throwaway local PostgreSQL 16 (no shared database) with a small Karim B. fixture: the three
 * players he owns (one with a provider absence, one whose J9 is a 5 under the rating rule, J10
 * pending), the league of two and the open journée 11. The pgTAP test
 * supabase/tests/database/premium_deadline_briefing.test.sql works the same figures out by hand.
 */
const BRIEFING: unknown = JSON.parse(
  '{"team": {"id": "00000000-0000-4000-8000-0000000000f1", "bank": 0.8, "name": "KACM FC", "teamValue": 100, "maxPerClub": 3, "freeTransfers": 1, "transferHitCost": 4, "captainMultiplier": 2}, "squad": [{"club": {"id": "00000000-0000-4000-8000-0000000000e2", "name": "Raja", "shortName": "RCA"}, "form": [{"state": "published", "points": 7, "minutes": 90, "publishedAt": "2026-09-30T07:34:32.538827+00:00", "gameweekName": "J8", "gameweekSequence": 8}, {"state": "no_rating", "points": null, "minutes": 60, "publishedAt": "2026-10-06T07:34:32.538827+00:00", "gameweekName": "J9", "gameweekSequence": 9}, {"state": "pending", "points": null, "minutes": null, "publishedAt": null, "gameweekName": "J10", "gameweekSequence": 10}], "name": "P1", "role": null, "price": 9.5, "absence": {"asOf": "2026-10-13T07:34:32.539356+00:00", "source": "provider", "category": "injury", "gamesMissed": 2, "expectedReturnOn": "2026-10-30"}, "captain": false, "position": "MID", "salePrice": 9.5, "nextFixture": {"isHome": true, "opponent": {"id": "00000000-0000-4000-8000-0000000000e3", "name": "AS FAR", "shortName": "FAR"}, "confidence": "medium", "difficulty": 2}, "viceCaptain": false, "fantasyPlayerId": "00000000-0000-4000-8000-000000000201"}, {"club": {"id": "00000000-0000-4000-8000-0000000000e1", "name": "Wydad", "shortName": "WAC"}, "form": [{"state": "published", "points": 0, "minutes": 0, "publishedAt": "2026-09-30T07:34:32.533121+00:00", "gameweekName": "J8", "gameweekSequence": 8}, {"state": "published", "points": 0, "minutes": 0, "publishedAt": "2026-10-06T07:34:32.533121+00:00", "gameweekName": "J9", "gameweekSequence": 9}, {"state": "pending", "points": null, "minutes": null, "publishedAt": null, "gameweekName": "J10", "gameweekSequence": 10}], "name": "P3", "role": null, "price": 8.5, "absence": null, "captain": false, "position": "MID", "salePrice": 8.5, "nextFixture": null, "viceCaptain": false, "fantasyPlayerId": "00000000-0000-4000-8000-000000000203"}, {"club": {"id": "00000000-0000-4000-8000-0000000000e2", "name": "Raja", "shortName": "RCA"}, "form": [{"state": "published", "points": 0, "minutes": 0, "publishedAt": "2026-09-30T07:34:32.533121+00:00", "gameweekName": "J8", "gameweekSequence": 8}, {"state": "published", "points": 8, "minutes": 90, "publishedAt": "2026-10-06T07:34:32.538827+00:00", "gameweekName": "J9", "gameweekSequence": 9}, {"state": "published", "points": 6, "minutes": 90, "publishedAt": "2026-10-14T07:34:32.538827+00:00", "gameweekName": "J10", "gameweekSequence": 10}], "name": "P2", "role": "starter", "price": 9.0, "absence": null, "captain": true, "position": "FWD", "salePrice": 9.0, "nextFixture": {"isHome": true, "opponent": {"id": "00000000-0000-4000-8000-0000000000e3", "name": "AS FAR", "shortName": "FAR"}, "confidence": "medium", "difficulty": 2}, "viceCaptain": false, "fantasyPlayerId": "00000000-0000-4000-8000-000000000202"}], "league": {"id": "00000000-0000-4000-8000-0000000000a2", "name": "Les Lions", "rank": 3, "size": 2, "ahead": ["Sami FC"]}, "locked": false, "gameweek": {"id": "00000000-0000-4000-8000-0000000000cb", "name": "J11", "sequence": 11, "deadlineAt": "2026-10-17T07:34:32.533121+00:00"}, "available": true, "published": [{"name": "J8", "state": "published", "sequence": 8, "publishedAt": "2026-09-30T07:34:32.533121+00:00"}, {"name": "J9", "state": "published", "sequence": 9, "publishedAt": "2026-10-06T07:34:32.533121+00:00"}, {"name": "J10", "state": "partial", "sequence": 10, "publishedAt": "2026-10-14T07:34:32.538827+00:00"}], "absenceFeed": {"listed": 1}}',
);
const ALTERNATIVES: unknown = JSON.parse(
  '{"items": [{"club": {"id": "00000000-0000-4000-8000-0000000000e1", "name": "Wydad", "shortName": "WAC"}, "form": [{"state": "published", "points": 0, "minutes": 0, "publishedAt": "2026-09-30T07:34:32.533121+00:00", "gameweekName": "J8", "gameweekSequence": 8}, {"state": "published", "points": 0, "minutes": 0, "publishedAt": "2026-10-06T07:34:32.533121+00:00", "gameweekName": "J9", "gameweekSequence": 9}, {"state": "pending", "points": null, "minutes": null, "publishedAt": null, "gameweekName": "J10", "gameweekSequence": 10}], "name": "P4", "price": 8.0, "position": "MID", "fantasyPlayerId": "00000000-0000-4000-8000-000000000204", "clubInSquadAfter": 2}, {"club": {"id": "00000000-0000-4000-8000-0000000000e1", "name": "Wydad", "shortName": "WAC"}, "form": [{"state": "published", "points": 0, "minutes": 0, "publishedAt": "2026-09-30T07:34:32.533121+00:00", "gameweekName": "J8", "gameweekSequence": 8}, {"state": "published", "points": 0, "minutes": 0, "publishedAt": "2026-10-06T07:34:32.533121+00:00", "gameweekName": "J9", "gameweekSequence": 9}, {"state": "pending", "points": null, "minutes": null, "publishedAt": null, "gameweekName": "J10", "gameweekSequence": 10}], "name": "P5", "price": 7.5, "position": "MID", "fantasyPlayerId": "00000000-0000-4000-8000-000000000205", "clubInSquadAfter": 2}], "budget": {"max": 10.3, "bank": 0.8, "salePrice": 9.5}, "locked": false, "available": true, "playerOut": "00000000-0000-4000-8000-000000000201", "maxPerClub": 3}',
);
const LOCKED: unknown = JSON.parse('{"locked":true,"available":true}');
const OFF: unknown = JSON.parse('{"available":false}');
const EMPTY: unknown = JSON.parse('{"locked":false,"gameweek":null,"available":true}');

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
  return { repository: new SupabasePremiumBriefingRepository(api as never), calls };
}
const context = { actorId: null, requestId: "test" };

describe("deadline briefing contract", () => {
  it("accepts the database's answers as they are", () => {
    const parsed = briefingResponseSchema.parse(BRIEFING);
    expect(isBriefingMember(parsed)).toBe(true);
    if (!isBriefingMember(parsed)) return;
    expect(parsed.gameweek.sequence).toBe(11);
    expect(parsed.team).toMatchObject({ freeTransfers: 1, transferHitCost: 4, maxPerClub: 3 });
    expect(parsed.absenceFeed.listed).toBe(1);
    expect(parsed.league).toMatchObject({ rank: 3, size: 2, ahead: ["Sami FC"] });
    const states = parsed.squad.find((p) => p.name === "P1")!.form.map((c) => c.state);
    // A 5 after an appearance under the rating rule is « no_rating », and pending stays pending.
    expect(states).toEqual(["published", "no_rating", "pending"]);
    const noRating = parsed.squad.find((p) => p.name === "P1")!.form[1]!;
    expect(noRating.points).toBeNull();
    expect(parsed.squad.find((p) => p.name === "P1")!.absence?.source).toBe("provider");
    expect(parsed.squad.find((p) => p.name === "P3")!.role).toBeNull();
  });

  it("reads off, locked and empty as answers, and tells them from a member's briefing", () => {
    expect(briefingResponseSchema.parse(OFF)).toEqual({ available: false });
    const locked = briefingResponseSchema.parse(LOCKED);
    expect(locked).toEqual({ available: true, locked: true });
    expect(isBriefingMember(locked)).toBe(false);
    const empty = briefingResponseSchema.parse(EMPTY);
    expect(isBriefingMember(empty)).toBe(false);
    // A locked answer carries nothing else.
    expect(() =>
      briefingResponseSchema.parse({ available: true, locked: true, squad: [] }),
    ).toThrow();
  });

  it("accepts the alternatives answer and refuses a malformed one", () => {
    const parsed = alternativesResponseSchema.parse(ALTERNATIVES);
    expect(isAlternativesMember(parsed)).toBe(true);
    if (!isAlternativesMember(parsed)) return;
    expect(parsed.budget).toMatchObject({ salePrice: 9.5, bank: 0.8, max: 10.3 });
    expect(parsed.items).toHaveLength(2);
    expect(() => alternativesResponseSchema.parse({ available: true, locked: false })).toThrow();
    expect(() =>
      briefingResponseSchema.parse({ ...(BRIEFING as object), squad: [{ name: "x" }] }),
    ).toThrow();
  });

  it("the example (what a non-member sees blurred, and what development serves) passes the same schema", () => {
    expect(isBriefingMember(briefingResponseSchema.parse(exampleBriefing()))).toBe(true);
    const out = exampleBriefing().squad[7]!.fantasyPlayerId;
    expect(isAlternativesMember(alternativesResponseSchema.parse(exampleAlternatives(out)))).toBe(
      true,
    );
    // No example figure is a number where the rule says « sans note ».
    const noRating = exampleAlternatives(out)
      .items.flatMap((i) => i.form)
      .filter((c) => c.state === "no_rating");
    expect(noRating.length).toBeGreaterThan(0);
    for (const cell of noRating) expect(cell.points).toBeNull();
  });
});

describe("the Supabase repository", () => {
  it("sends the season and the player with every argument, nulls included", async () => {
    const { repository, calls } = fakeApi((name) => ({
      data: name === "get_my_deadline_briefing" ? BRIEFING : ALTERNATIVES,
      error: null,
    }));
    await repository.briefing(null, context);
    await repository.alternatives("00000000-0000-4000-8000-000000000001", 6, context);
    expect(calls).toEqual([
      { name: "get_my_deadline_briefing", args: { p_season_id: null } },
      {
        name: "get_my_briefing_alternatives",
        args: { p_player_out: "00000000-0000-4000-8000-000000000001", p_limit: 6 },
      },
    ]);
  });

  it("reads a database the migration has not reached as switched off", async () => {
    const { repository } = fakeApi(() => ({
      data: null,
      error: { code: "PGRST202", message: "Could not find the function" },
    }));
    expect(await repository.briefing(null, context)).toEqual({ available: false });
  });

  it("fails loudly on any other error, and on an answer that is not the contract", async () => {
    const timeout = fakeApi(() => ({ data: null, error: { code: "57014", message: "timeout" } }));
    await expect(timeout.repository.briefing(null, context)).rejects.toBeInstanceOf(
      ManagerCardError,
    );
    const bad = fakeApi(() => ({ data: { available: "yes" }, error: null }));
    await expect(bad.repository.briefing(null, context)).rejects.toBeInstanceOf(ManagerCardError);
    const missing = fakeApi(() => ({
      data: null,
      error: { code: "PT404", message: "fantasy_player_not_found" },
    }));
    await expect(missing.repository.alternatives("x", 6, context)).rejects.toMatchObject({
      code: "not_found",
    });
  });
});
