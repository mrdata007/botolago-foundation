import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, spyOn } from "bun:test";

import { isMfaStepUpError, onMfaStepUpRequired } from "@/backend/auth/step-up";
import type { FantasyHubDto } from "@/backend/fantasy/contracts";
import { FantasyError, mapFantasyError } from "@/backend/fantasy/errors";
import { SupabaseFantasyRepository } from "@/backend/fantasy/supabase-repository";
import { fantasyService } from "./fantasy-runtime";

/**
 * A Fantasy league write refused until the one-time code is in (`PT403
 * mfa_required`), from the server's answer to the check the league screens
 * branch on. Creating a league (/fantasy/leagues), joining one with a code or
 * a public one (/fantasy/leagues/join) and leaving one
 * (/fantasy/leagues/$leagueId) call `showStepUpNotice` when
 * `isMfaStepUpError(error)` holds, and add nothing of their own -- pinned at
 * the source in `src/routes/step-up-screens.test.ts`. This runs what comes
 * before them: the runtime service those screens call, in the mode production
 * runs, over the repository spied to answer as its `check()` does.
 *
 * The screens used to read the refusal as their own failure -- "Une erreur
 * est survenue.", or "Code invalide" under a code that was fine -- beside the
 * auth layer's notice.
 */

const SEASON = "00000000-0000-4000-8000-000000000001";
const GW = "00000000-0000-4000-8000-000000000102";
const TEAM = "00000000-0000-4000-8000-000000000201";
const LEAGUE = "00000000-0000-4000-8000-000000000301";

/** What supabase-js hands back for the database's refusal. */
const stepUp = () => ({ code: "PT403", message: "mfa_required", details: null, hint: null });
/** A refusal a Fantasy function raises itself. */
const raised = (message: string) => ({ code: "P0001", message, details: null, hint: null });

const hub: FantasyHubDto = {
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
    bank: 1,
    teamValue: 100,
    freeTransfers: 1,
    version: 3,
    status: "active",
    createdAt: "2026-09-01T00:00:00Z",
    updatedAt: "2026-09-20T00:00:00Z",
    squad: [],
    lineup: [],
    chips: { active: null, activeCancellable: false, used: [] },
  },
  rankingAvailable: true,
};

/** The raw error the next league write's RPC answers with. */
let answer: unknown = stepUp();
async function refuse(): Promise<never> {
  throw mapFantasyError(answer);
}

// Spies on the real class, undone below, rather than `mock.module`: a module
// mock is process-wide in Bun and would outlive this file (see
// `fantasy-create-enrolment.test.ts`).
const writes = {
  createLeague: spyOn(SupabaseFantasyRepository.prototype, "createLeague").mockImplementation(
    refuse,
  ),
  joinLeague: spyOn(SupabaseFantasyRepository.prototype, "joinLeague").mockImplementation(refuse),
  leaveLeague: spyOn(SupabaseFantasyRepository.prototype, "leaveLeague").mockImplementation(refuse),
};
const spies = [
  spyOn(SupabaseFantasyRepository.prototype, "getHub").mockImplementation(async () => hub),
  ...Object.values(writes),
  // The test process has no Supabase configuration: asked whose session a
  // read carries (`hubIdentity`), the client says so on the console and the
  // read goes on for an unknown visitor. Not this file's concern.
  spyOn(console, "error").mockImplementation(() => {}),
];

// The runtime reads its mode on every call; production runs `supabase`.
const MODE = "VITE_FANTASY_DATA_MODE";
const modeBefore = process.env[MODE];
beforeAll(() => {
  process.env[MODE] = "supabase";
});
afterAll(() => {
  if (modeBefore === undefined) delete process.env[MODE];
  else process.env[MODE] = modeBefore;
  for (const spy of spies) spy.mockRestore();
});

let told = 0;
let stopListening: () => void = () => {};
beforeEach(() => {
  answer = stepUp();
  told = 0;
  for (const spy of Object.values(writes)) spy.mockClear();
  stopListening = onMfaStepUpRequired(() => {
    told++;
  });
});
afterEach(() => stopListening());

/** Each league write, as its screen calls it, and the repository method it reaches. */
const WRITES: ReadonlyArray<{
  readonly screen: string;
  readonly method: keyof typeof writes;
  readonly write: () => Promise<unknown>;
}> = [
  {
    screen: "creating one (/fantasy/leagues)",
    method: "createLeague",
    write: () => fantasyService.createLeague("Les Lions de l'Atlas"),
  },
  {
    // The public tab joins through the same call, with the league's code or id.
    screen: "joining, with a code or a public one (/fantasy/leagues/join)",
    method: "joinLeague",
    write: () => fantasyService.joinLeague("A1B2C3D4E5F60718293A4B5C6D7E8F90"),
  },
  {
    screen: "leaving one (/fantasy/leagues/$leagueId)",
    method: "leaveLeague",
    write: () => fantasyService.leaveLeague(LEAGUE),
  },
];

async function refusalOf(write: Promise<unknown>): Promise<unknown> {
  return write.then(
    () => {
      throw new Error("the refused write went through");
    },
    (error: unknown) => error,
  );
}

describe("a Fantasy league write refused for the one-time code reaches its screen as a step-up", () => {
  for (const { screen, method, write } of WRITES) {
    it(screen, async () => {
      const failure = await refusalOf(write());
      // It went to the database, not to the mock leagues.
      expect(writes[method]).toHaveBeenCalledTimes(1);
      // The screens' check: the server's answer, found through the cause of
      // the Fantasy repository's own error ("data unavailable" on its face).
      expect(isMfaStepUpError(failure)).toBe(true);
      expect(failure).toBeInstanceOf(FantasyError);
      expect((failure as FantasyError).code).toBe("data_unavailable");
      expect((failure as FantasyError).cause).toEqual(stepUp());
      // The auth layer heard it on the way, and takes the manager to the code.
      expect(told).toBeGreaterThan(0);
    });
  }
});

describe("every other refusal keeps the screen's own message", () => {
  it("a wrong invite code is still 'Code invalide', and the auth layer is not told", async () => {
    answer = raised("invite_code_invalid");
    const failure = await refusalOf(fantasyService.joinLeague("NOT-A-CODE"));
    expect((failure as FantasyError).code).toBe("invite_code_invalid");
    expect(isMfaStepUpError(failure)).toBe(false);
    expect(told).toBe(0);
  });

  it("any other refusal, the other PT403s included, is still 'Une erreur est survenue'", async () => {
    for (const refusal of [
      raised("league_access_denied"),
      { code: "PT403", message: "account_banned", details: null, hint: null },
      new TypeError("Failed to fetch"),
    ]) {
      answer = refusal;
      for (const { screen, write } of WRITES) {
        const failure = await refusalOf(write());
        expect({ screen, refusal, stepUp: isMfaStepUpError(failure) }).toEqual({
          screen,
          refusal,
          stepUp: false,
        });
      }
    }
    expect(told).toBe(0);
  });
});
