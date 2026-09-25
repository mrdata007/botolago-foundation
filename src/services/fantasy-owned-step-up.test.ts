import { afterAll, afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { QueryClient } from "@tanstack/react-query";

import { onMfaStepUpRequired } from "@/backend/auth/step-up";
import type { FantasyHubDto } from "@/backend/fantasy/contracts";
import { mapFantasyError } from "@/backend/fantasy/errors";
import { SupabaseFantasyRepository } from "@/backend/fantasy/supabase-repository";
import { toRepoError } from "./fantasy-errors";
import {
  classifyRepoError,
  runOwnedMutation,
  type OwnedMutationContext,
} from "./fantasy-mutation-controller";
import { V2CloudFantasyRepository, type FantasySnapshot } from "./fantasy-owned-repository";
import { DEFAULT_STATE } from "./fantasy-state";

/**
 * A Fantasy write refused until the one-time code is in (`PT403
 * mfa_required`), followed from the server's answer to the flag the screens
 * branch on, through what production runs: `SupabaseFantasyRepository`
 * (spied to answer as its `check()` does, with `mapFantasyError`), the V2
 * adapter the owned provider hands the screens as `owned.repo`, the screens'
 * own typing where they add one, `runOwnedMutation`, and `classifyRepoError`.
 *
 * The review of the first fix ran this chain and found it broken for every
 * write but the lineup save: the adapter handed the transfer and chip
 * refusals on untyped, the controller filed them as `unknown`, and the
 * screens' step-up branches never ran -- "Les transferts n'ont pas pu être
 * confirmés." and "Indisponible" stayed beside the auth layer's notice. The
 * source tests in `src/routes/step-up-screens.test.ts` pin that each of those
 * screens wraps the write as `typed` does here.
 */

const SEASON = "00000000-0000-4000-8000-000000000001";
const GW = "00000000-0000-4000-8000-000000000102";
const TEAM = "00000000-0000-4000-8000-000000000201";

/** What supabase-js hands back for the database's refusal. */
const stepUp = () => ({ code: "PT403", message: "mfa_required", details: null, hint: null });
/** A refusal a Fantasy function raises itself. */
const raised = (message: string) => ({ code: "P0001", message, details: null, hint: null });

/** `withTypedRefusal` in `fantasy.transfers.tsx` and `fantasy.team.tsx`. */
function typed<T>(write: Promise<T>): Promise<T> {
  return write.catch((error: unknown) => {
    throw toRepoError(error);
  });
}

function hubWithTeam(owner: boolean): FantasyHubDto {
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
    team: owner
      ? {
          id: TEAM,
          seasonId: SEASON,
          currentGameweekId: GW,
          name: "Atlas Eleven",
          bank: 1,
          teamValue: 100,
          freeTransfers: 1,
          version: 3,
          status: "active",
          createdAt: "2026-09-01T00:00:00Z",
          updatedAt: "2026-09-20T00:00:00Z",
          squad: [],
          lineup: [],
          chips: { active: null, activeCancellable: true, used: [] },
        }
      : null,
    rankingAvailable: true,
  };
}

let hub: FantasyHubDto = hubWithTeam(true);
/** The raw error the next write's RPC answers with. */
let answer: unknown = stepUp();
async function refuse(): Promise<never> {
  throw mapFantasyError(answer);
}

// Spies on the real class, undone below, rather than `mock.module`: a module
// mock is process-wide in Bun and would outlive this file (see
// `fantasy-create-enrolment.test.ts`).
const spies = [
  spyOn(SupabaseFantasyRepository.prototype, "getHub").mockImplementation(async () => hub),
  spyOn(SupabaseFantasyRepository.prototype, "createTeam").mockImplementation(refuse),
  spyOn(SupabaseFantasyRepository.prototype, "saveLineup").mockImplementation(refuse),
  spyOn(SupabaseFantasyRepository.prototype, "confirmTransfers").mockImplementation(refuse),
  spyOn(SupabaseFantasyRepository.prototype, "activateChip").mockImplementation(refuse),
  spyOn(SupabaseFantasyRepository.prototype, "cancelChip").mockImplementation(refuse),
];
afterAll(() => {
  for (const spy of spies) spy.mockRestore();
});

let told = 0;
let stopListening: () => void = () => {};
beforeEach(() => {
  hub = hubWithTeam(true);
  answer = stepUp();
  told = 0;
  stopListening = onMfaStepUpRequired(() => {
    told++;
  });
});
afterEach(() => stopListening());

function mutationContext(): { ctx: OwnedMutationContext; statuses: string[] } {
  const statuses: string[] = [];
  return {
    statuses,
    ctx: {
      qc: new QueryClient(),
      scope: { source: "cloud", owner: "user-1" },
      setMutationStatus: (status) => void statuses.push(status),
      invalidateOwned: () => {},
    },
  };
}

const lineup = {
  teamName: "Atlas Eleven",
  managerName: null,
  formation: "4-4-2" as const,
  bank: 1,
  freeTransfers: 1,
  pendingTransfers: 0,
  squad: [],
  purchasePrices: {},
  expectedVersion: 3,
  currentGameweekId: GW,
  lifecycle: DEFAULT_STATE,
};

/** Each owned write, as its screen hands it to `runOwnedMutation`. */
const WRITES: ReadonlyArray<{
  readonly screen: string;
  readonly owner: boolean;
  readonly write: (repo: V2CloudFantasyRepository) => Promise<FantasySnapshot>;
}> = [
  // The adapter types what `saveTeam` throws itself; the screens call it bare.
  { screen: "Pick Team, the lineup", owner: true, write: (repo) => repo.saveTeam(lineup) },
  {
    screen: "team creation",
    owner: false,
    write: (repo) => repo.saveTeam({ ...lineup, expectedVersion: 0 }),
  },
  {
    screen: "Transfers, the confirmation",
    owner: true,
    write: (repo) =>
      typed(
        repo.confirmTransfers({
          expectedVersion: 3,
          formation: "4-4-2",
          bank: 1,
          freeTransfers: 0,
          pendingTransfers: 0,
          squad: [],
          purchasePrices: {},
          currentGameweekId: GW,
          lifecycle: DEFAULT_STATE,
          transfers: [],
        }),
      ),
  },
  {
    screen: "Transfers and Pick Team, a chip activated",
    owner: true,
    write: (repo) =>
      typed(repo.activateChip({ gameweekId: GW, chip: "bench_boost", expectedVersion: 3 })),
  },
  {
    screen: "Pick Team, a chip cancelled",
    owner: true,
    write: (repo) => typed(repo.cancelChip({ gameweekId: GW, expectedVersion: 3 })),
  },
];

async function run(write: (repo: V2CloudFantasyRepository) => Promise<FantasySnapshot>) {
  const { ctx, statuses } = mutationContext();
  const repo = new V2CloudFantasyRepository("user-1");
  const result = await runOwnedMutation(ctx, { action: () => write(repo), args: undefined });
  if (result.ok) throw new Error("the refused write went through");
  return { result, statuses, flags: classifyRepoError(result.error) };
}

describe("a Fantasy write refused for the one-time code reaches its screen as a step-up", () => {
  for (const { screen, owner, write } of WRITES) {
    it(screen, async () => {
      hub = hubWithTeam(owner);
      const { result, statuses, flags } = await run(write);
      expect({ code: result.error.code, kind: result.kind, isStepUp: flags.isStepUp }).toEqual({
        code: "mfa_required",
        kind: "error",
        isStepUp: true,
      });
      // Not a conflict: nothing is reloaded, and the draft waits for the code.
      expect(flags.isConflict).toBe(false);
      expect(statuses).toEqual(["saving", "error"]);
      // The auth layer heard it on the way, and takes the manager to the code.
      expect(told).toBeGreaterThan(0);
    });
  }
});

describe("the same writes keep every other refusal's meaning", () => {
  it("a stale version is a conflict, so the screens that reload on one do", async () => {
    answer = raised("version_conflict");
    for (const { screen, owner, write } of WRITES.filter((entry) => entry.owner)) {
      hub = hubWithTeam(owner);
      const { result, flags } = await run(write);
      expect({ screen, kind: result.kind, isConflict: flags.isConflict }).toEqual({
        screen,
        kind: "conflict",
        isConflict: true,
      });
    }
    expect(told).toBe(0);
  });

  it("a chip the rules refuse is not a step-up: the screens keep 'Indisponible'", async () => {
    answer = raised("chip_already_used");
    const chip = WRITES.find((entry) => entry.screen.includes("activated"))!;
    const { result, flags } = await run(chip.write);
    expect(result.error.code).toBe("validation");
    expect(flags.isStepUp || flags.isConflict || flags.isPermission).toBe(false);
    expect(told).toBe(0);
  });
});
