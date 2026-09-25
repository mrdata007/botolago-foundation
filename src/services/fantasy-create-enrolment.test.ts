import { beforeEach, describe, expect, it, mock } from "bun:test";

import type { FantasyHubDto } from "@/backend/fantasy/contracts";
import { FantasyError, mapFantasyError } from "@/backend/fantasy/errors";
import { dictionaries } from "@/i18n/dictionaries";

/**
 * The squad-submission path that failed in production on 2026-09-24: a new
 * manager, after GW1's deadline, built a legal squad and pressed "Entrer
 * l'effectif". `create_fantasy_team` answered 409 `fantasy_gameweek_locked`;
 * the client sent the closed gameweek's id, turned the precise refusal into
 * `unknown`, and showed "L'importation a échoué".
 */

const GW1 = "00000000-0000-4000-8000-000000000101";
const GW2 = "00000000-0000-4000-8000-000000000102";
const SEASON = "00000000-0000-4000-8000-000000000001";

let hub: FantasyHubDto;
const createCalls: Array<{ gameweekId: string; teamName: string }> = [];
let createFailure: unknown = null;

mock.module("@/backend/fantasy/supabase-repository", () => ({
  SupabaseFantasyRepository: class {
    async getHub() {
      return hub;
    }
    async createTeam(input: { gameweekId: string; teamName: string }) {
      createCalls.push({ gameweekId: input.gameweekId, teamName: input.teamName });
      if (createFailure) throw createFailure;
      return {};
    }
  },
}));

const { V2CloudFantasyRepository } = await import("./fantasy-owned-repository");
const { createTeamErrorKey } = await import("./fantasy-create-service");
const { toRepoError } = await import("./fantasy-errors");

function closedGw1Hub(): FantasyHubDto {
  return {
    season: { id: SEASON, name: "2026/2027", status: "registration_open" },
    gameweek: {
      id: GW1,
      sequence: 1,
      name: "1",
      deadlineAt: "2026-09-24T13:30:00Z",
      status: "open",
      pointsState: "provisional",
    },
    enrolmentGameweek: {
      id: GW2,
      sequence: 2,
      name: "2",
      deadlineAt: "2099-10-02T14:30:00Z",
      status: "scheduled",
    },
    team: null,
    rankingAvailable: false,
  };
}

const squadInput = {
  teamName: "Atlas Eleven",
  managerName: null,
  formation: "4-4-2" as const,
  bank: 10,
  freeTransfers: 1,
  pendingTransfers: 0,
  squad: [],
  purchasePrices: {},
  expectedVersion: 0,
  lifecycle: { chips: { active: null, used: [] } } as never,
};

describe("new-team submission after the current deadline", () => {
  beforeEach(() => {
    hub = closedGw1Hub();
    createCalls.length = 0;
    createFailure = null;
  });

  it("joins the gameweek the create screen showed", async () => {
    const repo = new V2CloudFantasyRepository("user-1");
    await repo.saveTeam({ ...squadInput, currentGameweekId: GW2 }).catch(() => undefined);
    expect(createCalls[0]?.gameweekId).toBe(GW2);
  });

  it("without an explicit gameweek, joins the server's enrolment gameweek, never the closed one", async () => {
    const repo = new V2CloudFantasyRepository("user-1");
    await repo.saveTeam({ ...squadInput, currentGameweekId: null }).catch(() => undefined);
    expect(createCalls[0]?.gameweekId).toBe(GW2);
  });

  it("surfaces a passed deadline as gameweek_locked, with the server's code kept", async () => {
    createFailure = mapFantasyError({
      code: "PT409",
      message: "fantasy_gameweek_locked",
      details: null,
    });
    const repo = new V2CloudFantasyRepository("user-1");
    const error = await repo
      .saveTeam({ ...squadInput, currentGameweekId: GW1 })
      .then(() => null)
      .catch((caught: unknown) => caught as { code: string; domainCode?: string });
    expect(error?.code).toBe("gameweek_locked");
    expect(error?.domainCode).toBe("fantasy_gameweek_locked");
    const key = createTeamErrorKey(error!);
    expect(key).toBe("fantasy.create.error.deadline_passed");
    expect(dictionaries.fr[key]).not.toMatch(/import/i);
    expect(dictionaries.fr[key]).toMatch(/date limite/);
  });

  it("keeps budget and name refusals distinct from the generic message", async () => {
    for (const [message, expected] of [
      ["budget_exceeded", "fantasy.create.error.budget"],
      ["club_limit_exceeded", "fantasy.create.error.club_limit"],
      ["invalid_team_name", "fantasy.create.error.team_name"],
      ["player_not_eligible", "fantasy.create.error.player_unavailable"],
      ["invalid_squad", "fantasy.create.error.rejected"],
    ] as const) {
      createFailure = mapFantasyError({ code: "PT400", message, details: null });
      const repo = new V2CloudFantasyRepository("user-1");
      const error = await repo
        .saveTeam({ ...squadInput, currentGameweekId: GW2 })
        .then(() => null)
        .catch((caught: unknown) => caught as { code: string; domainCode?: string });
      expect({ message, key: createTeamErrorKey(error!) }).toEqual({ message, key: expected });
    }
  });

  it("an unclassified failure reads as a retryable save failure, not an import", () => {
    const key = createTeamErrorKey({ code: "unknown" });
    expect(key).toBe("fantasy.create.error.generic");
    expect(dictionaries.fr[key]).not.toMatch(/import/i);
    expect(dictionaries.ar[key]).not.toMatch(/استيراد/);
  });

  it("a network failure inside the typed error is reported as a network problem", () => {
    const mapped = toRepoError(
      new FantasyError("data_unavailable", "x", new TypeError("Failed to fetch")),
    );
    expect(mapped.code).toBe("network");
    expect(createTeamErrorKey(mapped)).toBe("fantasy.error.network");
    expect(toRepoError(new FantasyError("data_unavailable", "x", { code: "XX000" })).code).toBe(
      "unknown",
    );
  });
});
