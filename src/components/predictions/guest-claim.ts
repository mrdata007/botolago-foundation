import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useCallback, useSyncExternalStore } from "react";
import { toast } from "sonner";

import type {
  ClaimGuestPredictionsDto,
  GuestClaimInput,
  MatchVoteInput,
} from "@/backend/predictions/contracts";
import { mapPredictionsError, type PredictionsErrorCode } from "@/backend/predictions/errors";
import {
  forgetGuestVotes,
  guestVoteItems,
  readGuestVotes,
} from "@/backend/predictions/guest-votes";
import type { TranslationKey } from "@/i18n/dictionaries";
import { useI18n } from "@/i18n/provider";
import { PRONOSTICS_ENABLED } from "@/lib/feature-flags";
import { authService } from "@/services/auth";
import { predictionsService } from "@/services/predictions";
import type { Language } from "@/types/domain";
import { claimImportedLabel, claimKeptLabel, claimStartedLabel } from "./predictions-copy";
import { getGuestStore, noteServerTime } from "./predictions-runtime";

/**
 * Where the visitor's picks stand on the way to the account. Observable, so the
 * Pronostics screen can say what is still unsaved and offer "Réessayer"
 * instead of the import being a background side effect nobody can see.
 */
export type GuestClaimStatus =
  | { readonly phase: "idle" }
  | {
      readonly phase: "pending";
      readonly owner: string;
      readonly attempt: number;
      readonly remaining: number;
    }
  | {
      readonly phase: "failed";
      readonly owner: string;
      /** Picks still only on the phone and still importable. */
      readonly remaining: number;
      readonly code: PredictionsErrorCode;
      /** True while a further automatic attempt is scheduled. */
      readonly retrying: boolean;
    }
  | {
      readonly phase: "done";
      readonly owner: string;
      readonly imported: number;
      readonly keptExisting: number;
      /** Picks refused because their match had started: they stay marked, never backdated. */
      readonly started: number;
    };

const IDLE_STATUS: GuestClaimStatus = { phase: "idle" };

/**
 * Waits between automatic attempts after the first one: a few tries, spaced
 * out, then the reader's own "Réessayer". Never endless.
 */
export const CLAIM_RETRY_DELAYS_MS: readonly number[] = [5_000, 20_000];

/** At most this many requests in one run, whatever the server answers. */
const MAX_BATCHES_PER_RUN = 5;

/**
 * Only a request that may well succeed as it is gets tried again by itself.
 * A refusal (the game is off, the account is suspended, a code is owed, the
 * payload is rejected) does not change by asking again, and the server's
 * kick-off deadline is never argued with: a started match is answered
 * `started` and stays on the phone, marked.
 */
export function claimRetryable(code: PredictionsErrorCode): boolean {
  return code === "network" || code === "data_unavailable";
}

export interface GuestClaimSummary {
  readonly imported: number;
  readonly keptExisting: number;
  readonly started: number;
}

/** What the claim takes from the app; the tests hand it stand-ins. */
export interface GuestClaimServices {
  readonly enabled: boolean;
  /** The signed-in account at this moment, or null. */
  accountId(): string | null;
  /** The phone's picks that can still be imported (started ones excluded). */
  pending(): readonly GuestClaimInput[];
  send(items: readonly GuestClaimInput[]): Promise<ClaimGuestPredictionsDto>;
  /** Takes what the server confirmed off the phone, and nothing else. */
  apply(result: ClaimGuestPredictionsDto): void;
  report(summary: GuestClaimSummary): void;
  /** Runs `run` after `ms`; returns the way to cancel it. */
  schedule(run: () => void, ms: number): () => void;
}

export interface GuestClaimController {
  getStatus(): GuestClaimStatus;
  subscribe(listener: () => void): () => void;
  /**
   * Starts an import for the signed-in account, or joins the one under way
   * for it. Called again (the reader's "Réessayer") it cancels a waiting
   * automatic attempt and starts afresh.
   */
  start(): Promise<void>;
}

/**
 * The visitor's picks move to the account at sign-in (plan §4): register,
 * log-in and Google alike, because it runs whenever a session appears.
 *
 * - The phone keeps every pick until the server has answered for it: what the
 *   account took (imported), already had (kept) or can never count (invalid)
 *   leaves; a pick refused because its match had started stays, marked "non
 *   comptabilisé". A failed request removes nothing.
 * - The account's own picks always win on the server; nothing here sends a
 *   pick over one, and one run at a time means no pick is sent twice.
 * - A failed request is reported (`failed`, with how many picks remain) and,
 *   if it may succeed as it is, tried again twice with growing waits. After
 *   that, or after a refusal, only the reader's "Réessayer" tries again.
 * - It belongs to the account that began it: a waiting attempt for an account
 *   that has left is dropped, and the next account's sign-in starts its own.
 */
export function createGuestClaimController(
  services: GuestClaimServices,
  delays: readonly number[] = CLAIM_RETRY_DELAYS_MS,
): GuestClaimController {
  let status: GuestClaimStatus = IDLE_STATUS;
  const listeners = new Set<() => void>();
  let inFlight: { owner: string; promise: Promise<void> } | null = null;
  let cancelWait: (() => void) | null = null;

  const set = (next: GuestClaimStatus) => {
    status = next;
    for (const listener of [...listeners]) listener();
  };
  const dropWait = () => {
    cancelWait?.();
    cancelWait = null;
  };

  async function run(owner: string, firstAttempt: number): Promise<void> {
    const total = { imported: 0, keptExisting: 0, started: 0 };
    let attempt = firstAttempt;
    for (let batch = 0; batch < MAX_BATCHES_PER_RUN; batch += 1) {
      // Another account is signed in now: the next batch is theirs to send.
      if (services.accountId() !== owner) return set(IDLE_STATUS);
      const items = services.pending();
      if (items.length === 0) break;
      set({ phase: "pending", owner, attempt, remaining: items.length });
      let result: ClaimGuestPredictionsDto;
      try {
        result = await services.send(items);
      } catch (error) {
        const { code } = mapPredictionsError(error);
        const stillOwner = services.accountId() === owner;
        const retrying = stillOwner && claimRetryable(code) && attempt <= delays.length;
        set({ phase: "failed", owner, remaining: services.pending().length, code, retrying });
        if (retrying) {
          const next = attempt + 1;
          cancelWait = services.schedule(
            () => {
              cancelWait = null;
              if (services.accountId() === owner) void launch(owner, next);
              else set(IDLE_STATUS);
            },
            delays[attempt - 1] ?? 0,
          );
        }
        return;
      }
      services.apply(result);
      total.imported += result.imported;
      total.keptExisting += result.keptExisting;
      total.started += result.started;
      attempt = 1;
      if (services.pending().length === 0) break;
      // Picks left and none answered: asking again as is would not move them.
      if (result.results.length === 0) {
        set({
          phase: "failed",
          owner,
          remaining: services.pending().length,
          code: "data_unavailable",
          retrying: false,
        });
        return;
      }
    }
    const remaining = services.pending().length;
    if (remaining > 0) {
      set({ phase: "failed", owner, remaining, code: "data_unavailable", retrying: false });
      return;
    }
    set({ phase: "done", owner, ...total });
    services.report(total);
  }

  function launch(owner: string, attempt: number): Promise<void> {
    const promise: Promise<void> = run(owner, attempt).finally(() => {
      if (inFlight?.promise === promise) inFlight = null;
    });
    inFlight = { owner, promise };
    return promise;
  }

  const controller: GuestClaimController = {
    getStatus: () => status,
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    start() {
      if (!services.enabled) return Promise.resolve();
      const owner = services.accountId();
      if (!owner) return Promise.resolve();
      if (inFlight) {
        // The same account: one import, not two. Another account signed in
        // meanwhile: theirs starts when the first has finished.
        const current = inFlight;
        return current.owner === owner
          ? current.promise
          : current.promise.then(() => controller.start());
      }
      dropWait();
      if (services.pending().length === 0) {
        if (status.phase === "pending" || status.phase === "failed") set(IDLE_STATUS);
        return Promise.resolve();
      }
      return launch(owner, 1);
    },
  };
  return controller;
}

type Translate = (key: TranslationKey) => string;
let appContext: { queryClient: QueryClient; lang: Language; t: Translate } | null = null;

/** The language and cache the import's message and refresh use; set at sign-in and on retry. */
export function setGuestClaimContext(context: {
  queryClient: QueryClient;
  lang: Language;
  t: Translate;
}): void {
  appContext = context;
}

const appServices: GuestClaimServices = {
  enabled: PRONOSTICS_ENABLED,
  accountId: () => {
    const session = authService.getSession();
    return session.status === "authenticated" ? (session.user?.id ?? null) : null;
  },
  pending: () => {
    const store = getGuestStore();
    return store.forClaim(store.read().seasonId);
  },
  send: (items) => predictionsService.claimGuest(items),
  apply: (result) => {
    noteServerTime(result.serverTime);
    getGuestStore().applyClaim(result.results);
    void appContext?.queryClient.invalidateQueries({ queryKey: ["predictions"] });
  },
  report: (summary) => {
    if (!appContext) return;
    const { lang, t } = appContext;
    const lines = [
      summary.imported > 0 ? claimImportedLabel(summary.imported, lang, t) : null,
      summary.keptExisting > 0 ? claimKeptLabel(summary.keptExisting, lang, t) : null,
      summary.started > 0 ? claimStartedLabel(summary.started, lang, t) : null,
    ].filter((line): line is string => line !== null);
    if (lines.length > 0)
      toast.success(t("predictions.claim.title"), { description: lines.join(" · ") });
  },
  schedule: (run, ms) => {
    const id = setTimeout(run, ms);
    return () => clearTimeout(id);
  },
};

const guestClaim = createGuestClaimController(appServices);

/** The import's status, for the Pronostics screen, with the reader's "Réessayer". */
export function useGuestClaim(): { status: GuestClaimStatus; retry: () => void } {
  const queryClient = useQueryClient();
  const { lang, t } = useI18n();
  const status = useSyncExternalStore(
    guestClaim.subscribe,
    guestClaim.getStatus,
    () => IDLE_STATUS,
  );
  const retry = useCallback(() => {
    setGuestClaimContext({ queryClient, lang, t });
    void guestClaim.start();
  }, [queryClient, lang, t]);
  return { status, retry };
}

/**
 * `status` if it is about `accountId` (it can still be about the account that
 * left); another account's status says nothing yet.
 */
export function claimStatusFor(
  status: GuestClaimStatus,
  accountId: string | null,
): GuestClaimStatus {
  return status.phase !== "idle" && status.owner === accountId ? status : IDLE_STATUS;
}

/**
 * Starts the import for the signed-in account. When the game is off or the
 * network fails, the picks stay on the phone and the screen offers a retry.
 */
export function claimGuestPredictionsOnSignIn({
  queryClient,
  lang,
  t,
}: {
  queryClient: QueryClient;
  lang: Language;
  t: (key: TranslationKey) => string;
}): Promise<void> {
  setGuestClaimContext({ queryClient, lang, t });
  return guestClaim.start();
}

let votesInFlight: Promise<void> | null = null;

export interface GuestVoteImportServices {
  accountId(): string | null;
  read: typeof readGuestVotes;
  forget: typeof forgetGuestVotes;
  send: typeof predictionsService.castMatchVote;
}

const guestVoteServices: GuestVoteImportServices = {
  accountId: () => {
    const session = authService.getSession();
    return session.status === "authenticated" ? (session.user?.id ?? null) : null;
  },
  read: readGuestVotes,
  forget: forgetGuestVotes,
  send: (item) => predictionsService.castMatchVote(item),
};

/**
 * A visitor's match votes move to the account at sign-in, like their picks:
 * each is cast as the account's own vote. Every one is tried, however old:
 * a visitor can vote weeks ahead, and only the database knows which matches
 * are still open. A vote refused for good (the match has kicked off, or is
 * not one Pronostics covers) leaves the phone too; when the game is off or
 * the network fails, the rest stay for the next sign-in.
 */
export function sendGuestVotesOnSignIn(
  queryClient: QueryClient,
  services: GuestVoteImportServices = guestVoteServices,
): Promise<void> {
  if (!PRONOSTICS_ENABLED || votesInFlight) return votesInFlight ?? Promise.resolve();
  const owner = services.accountId();
  if (!owner) return Promise.resolve();
  const items = guestVoteItems(services.read());
  if (items.length === 0) return Promise.resolve();
  votesInFlight = (async () => {
    const settled: MatchVoteInput[] = [];
    for (const item of items) {
      // Each request uses the current session. Stop if the account that began
      // this import left while the previous request was awaiting its answer.
      if (services.accountId() !== owner) break;
      try {
        await services.send(item);
        settled.push(item);
      } catch (error) {
        const { code } = mapPredictionsError(error);
        const final =
          code === "match_vote_closed" ||
          code === "match_vote_unavailable" ||
          code === "validation_failed" ||
          code === "account_banned";
        if (!final) break;
        settled.push(item);
      }
    }
    services.forget(settled);
    void queryClient.invalidateQueries({ queryKey: ["predictions", "match-votes"] });
  })().finally(() => {
    votesInFlight = null;
  });
  return votesInFlight;
}
