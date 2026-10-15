import { afterAll, beforeEach, describe, expect, it, spyOn } from "bun:test";

import { onMfaStepUpRequired } from "@/backend/auth/step-up";
import type { FantasyHubDto } from "@/backend/fantasy/contracts";
import { mapFantasyError } from "@/backend/fantasy/errors";
import { SupabaseFantasyRepository } from "@/backend/fantasy/supabase-repository";
import { V2CloudFantasyRepository } from "./fantasy-owned-repository";
import { classifyPreviewFailure } from "./transfers-service";

/**
 * FANT-01 / FANT-02 along the real chain: the server's answer ->
 * `SupabaseFantasyRepository` (spied, answering as `check()` does) -> the V2
 * adapter the transfers screen calls as `owned.repo` -> the reason the screen
 * says. Spies on the real class, undone below (a module mock would outlive the
 * file in Bun).
 */

const SEASON = "00000000-0000-4000-8000-000000000001";
const GW = "00000000-0000-4000-8000-000000000102";
const TEAM = "00000000-0000-4000-8000-000000000201";
const PLAYER = "00000000-0000-4000-8000-000000000301";

/** Owned player: bought at 7.0, now 7.4, so the database sells him for 7.2. */
function hub(): FantasyHubDto {
  return {
    season: { id: SEASON, name: "2026/2027", status: "active" },
    gameweek: {
      id: GW,
      sequence: 2,
      name: "2",
      deadlineAt: "2099-10-02T14:30:00Z",
      status: "open",
      pointsState: "provisional",
    },
    enrolmentGameweek: null,
    team: {
      id: TEAM,
      seasonId: SEASON,
      currentGameweekId: GW,
      name: "Atlas Eleven",
      bank: 0,
      teamValue: 100,
      freeTransfers: 1,
      version: 3,
      status: "active",
      createdAt: "2026-09-01T00:00:00Z",
      updatedAt: "2026-09-20T00:00:00Z",
      squad: [
        {
          membershipId: "00000000-0000-4000-8000-000000000401",
          fantasyPlayerId: PLAYER,
          footballPlayerId: "00000000-0000-4000-8000-000000000501",
          footballTeamId: "00000000-0000-4000-8000-000000000601",
          position: "FWD",
          price: 7.4,
          purchasePrice: 7.0,
          salePrice: 7.2,
          status: "available",
        },
      ],
      lineup: [],
      chips: { active: null, activeCancellable: true, used: [] },
    },
    rankingAvailable: true,
  };
}

let answer: unknown = null;
const spies = [
  spyOn(SupabaseFantasyRepository.prototype, "getHub").mockImplementation(async () => hub()),
  spyOn(SupabaseFantasyRepository.prototype, "previewTransfers").mockImplementation(async () => {
    throw mapFantasyError(answer);
  }),
];
afterAll(() => {
  for (const spy of spies) spy.mockRestore();
});

let stopListening: () => void = () => {};
beforeEach(() => {
  stopListening();
  stopListening = onMfaStepUpRequired(() => {});
});

const raised = (message: string, code = "P0001") => ({ code, message, details: null, hint: null });
const previewInput = {
  expectedVersion: 3,
  currentGameweekId: GW,
  chip: null,
  transfers: [
    {
      outSourceId: PLAYER,
      inSourceId: "x",
      priceOut: 7.4,
      priceIn: 7.3,
      cost: -0.1,
      hit: 0,
      chip: null,
    },
  ],
};

async function reasonFor(serverAnswer: unknown, shortfall: number | null = null) {
  answer = serverAnswer;
  const repo = new V2CloudFantasyRepository("user-1");
  try {
    await repo.previewTransfers(previewInput);
  } catch (error) {
    return classifyPreviewFailure(error, shortfall);
  }
  throw new Error("the preview was expected to be refused");
}

describe("the V2 snapshot carries the server's sale price (FANT-01)", () => {
  it("exposes current_sale_price per owned player, beside the purchase price", async () => {
    const snapshot = await new V2CloudFantasyRepository("user-1").loadSnapshot();
    expect(snapshot.salePrices).toEqual({ [PLAYER]: 7.2 });
    expect(snapshot.purchasePrices).toEqual({ [PLAYER]: 7.0 });
  });
});

describe("what the server's refusal becomes on screen (FANT-02)", () => {
  it("a budget refusal is a budget reason with the real shortfall", async () => {
    expect(await reasonFor(raised("budget_exceeded", "PT400"), 0.1)).toEqual({
      kind: "budget",
      shortfall: 0.1,
    });
  });

  it("a stale version is a stale reason", async () => {
    expect((await reasonFor(raised("version_conflict", "PT409"))).kind).toBe("stale");
  });

  it("a missing second factor is a step-up reason, not a failure", async () => {
    expect(
      (await reasonFor({ code: "PT403", message: "mfa_required", details: null, hint: null })).kind,
    ).toBe("step_up");
  });

  it("a request that never reached the server is a network reason", async () => {
    expect(
      (await reasonFor({ code: "", message: "TypeError: Failed to fetch", details: "", hint: "" }))
        .kind,
    ).toBe("network");
  });
});
