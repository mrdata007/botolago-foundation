import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import { onMfaStepUpRequired } from "@/backend/auth/step-up";
import { mapPredictionsError } from "@/backend/predictions/errors";
import { SupabasePredictionsRepository } from "@/backend/predictions/supabase-repository";
import type { TranslationKey } from "@/i18n/dictionaries";
import { leagueErrorMessage } from "./leagues-copy";

/**
 * A league write refused until the one-time code is in, from the server's
 * answer to the code the league screens branch on. The league's page (a new
 * code, leaving) and the two forms (join with a code, create) call
 * `showStepUpNotice` for `mfa_required` and add nothing of their own -- pinned
 * at the source in `src/routes/step-up-screens.test.ts`. This runs what comes
 * before them through the repository production uses, with an API that
 * answers as PostgREST does, so a branch that could never run (as the Fantasy
 * chip branches could not, see `fantasy-owned-step-up.test.ts`) would show.
 */

type Api = ConstructorParameters<typeof SupabasePredictionsRepository>[0];

/** Every RPC answers `{ data: null, error }`, as supabase-js hands a refusal back. */
function answering(error: unknown): Api {
  const settled = Promise.resolve({ data: null, error });
  const request = { then: settled.then.bind(settled), abortSignal: () => settled };
  return { rpc: () => request } as unknown as Api;
}

const stepUp = () => ({ code: "PT403", message: "mfa_required", details: null, hint: null });
const LEAGUE = "00000000-0000-4000-8000-000000000301";
const context = { actorId: "user-1", requestId: "request-1" };
const t = (key: TranslationKey) => key;

const WRITES: ReadonlyArray<
  readonly [string, (repo: SupabasePredictionsRepository) => Promise<unknown>]
> = [
  ["joining with a code (the form, the invite page)", (repo) => repo.joinLeague("K7M2QX", context)],
  ["creating one (the form)", (repo) => repo.createLeague("Les Lions de l'Atlas", context)],
  ["a new invite code (the league's page)", (repo) => repo.resetLeagueInviteCode(LEAGUE, context)],
  ["leaving (the league's page)", (repo) => repo.leaveLeague(LEAGUE, context)],
];

async function refusalOf(write: Promise<unknown>): Promise<unknown> {
  return write.then(
    () => {
      throw new Error("the refused write went through");
    },
    (error: unknown) => error,
  );
}

let told = 0;
let stopListening: () => void = () => {};
beforeEach(() => {
  told = 0;
  stopListening = onMfaStepUpRequired(() => {
    told++;
  });
});
afterEach(() => stopListening());

describe("a Pronostics league write refused for the one-time code", () => {
  for (const [name, write] of WRITES) {
    it(`${name}: reaches the screen as mfa_required, and the auth layer hears it`, async () => {
      const failure = await refusalOf(
        write(new SupabasePredictionsRepository(answering(stepUp()))),
      );
      // What the page's and the forms' `onError` compute before they branch.
      expect(mapPredictionsError(failure).code).toBe("mfa_required");
      expect(told).toBeGreaterThan(0);
    });
  }

  it("any other refusal keeps its own sentence, and the auth layer is not told", async () => {
    const repo = new SupabasePredictionsRepository(
      answering({ code: "P0001", message: "invite_code_invalid", details: null, hint: null }),
    );
    const refusal = mapPredictionsError(await refusalOf(repo.joinLeague("K7M2QX", context))).code;
    expect(refusal).toBe("invite_code_invalid");
    expect(leagueErrorMessage(refusal, t)).toBe("predictions.leagues.code_invalid");
    expect(told).toBe(0);
  });
});
