// Pass 3.2 — Shared mutation controller for owned-Fantasy writes.
//
// Every cloud-side mutation (saveTeam, confirmTransfers, finalizeGameweek)
// funnels through `runOwnedMutation` so status transitions, cache updates,
// draft clearing and error-vs-conflict classification stay consistent.
//
// Draft preservation rule:
//   - success  → matching draft removed (caller supplies the key).
//   - error    → draft preserved untouched; caller may show retry.
//   - conflict → draft preserved; caller shows reload-latest / keep-working.
//
// Public caches (news, players, gameweek, clubs) are NEVER invalidated —
// invalidation is scoped to owned-Fantasy keys via
// `context.invalidateOwned()`.

import type { QueryClient } from "@tanstack/react-query";
import { FantasyRepoError } from "@/services/fantasy-errors";
import type { FantasySnapshot } from "@/services/fantasy-owned-repository";
import type { OwnedMutationStatus } from "@/services/fantasy-owned-provider";
import { fantasyDraftsStore, type FantasyDraftKey } from "@/services/fantasy-drafts-store";
import { type FantasyKeyScope } from "@/services/fantasy-data-source";

export interface OwnedMutationContext {
  qc: QueryClient;
  scope: FantasyKeyScope;
  setMutationStatus: (s: OwnedMutationStatus, err?: FantasyRepoError | null) => void;
  /** H1: monotonic sequence guard, provided by FantasyOwnedProvider. */
  nextMutationSeq?: () => number;
  setMutationStatusIfCurrent?: (
    seq: number,
    s: OwnedMutationStatus,
    err?: FantasyRepoError | null,
  ) => void;
  /** H1: install returned snapshot into the authoritative cache. */
  replaceSnapshot?: (snap: FantasySnapshot) => void;
  invalidateOwned: () => void;
}

export interface RunOwnedMutationInput<TArgs> {
  action: (args: TArgs) => Promise<FantasySnapshot>;
  args: TArgs;
  /** Draft key to remove on success (skipped when omitted). */
  matchingDraftKey?: FantasyDraftKey | null;
  /** Optional side-effect fired only after cache write + draft clear. */
  onSuccess?: (snapshot: FantasySnapshot) => void;
  /** After `saved`, revert status back to `idle` after this many ms. */
  savedIdleAfterMs?: number;
}

export type RunOwnedMutationResult =
  | { ok: true; snapshot: FantasySnapshot }
  | { ok: false; error: FantasyRepoError; kind: "conflict" | "error" };

/**
 * Pure orchestrator. `action` is the async cloud call producing the
 * authoritative snapshot. Never throws — errors are typed and returned.
 *
 * H1: uses a per-call monotonic sequence so a delayed `saved→idle` timer
 * from a previous mutation cannot overwrite a newer `saving` status. Never
 * silently falls back to local — cloud errors surface as typed results.
 */
export async function runOwnedMutation<TArgs>(
  ctx: OwnedMutationContext,
  input: RunOwnedMutationInput<TArgs>,
): Promise<RunOwnedMutationResult> {
  const seq = ctx.nextMutationSeq?.() ?? 0;
  const setStatus = (s: OwnedMutationStatus, err?: FantasyRepoError | null) => {
    if (ctx.setMutationStatusIfCurrent) ctx.setMutationStatusIfCurrent(seq, s, err ?? null);
    else ctx.setMutationStatus(s, err ?? null);
  };
  setStatus("saving", null);
  try {
    const snapshot = await input.action(input.args);
    // 1. Prime the authoritative snapshot cache with the returned value
    //    so the next render never flashes stale data.
    if (ctx.replaceSnapshot) ctx.replaceSnapshot(snapshot);
    // 2. Invalidate dependent owned surfaces (Team/Transfers/Points/Summary).
    ctx.invalidateOwned();
    // 3. Success clears the matching draft (transfers/team drafts alike).
    if (input.matchingDraftKey) {
      fantasyDraftsStore.remove(input.matchingDraftKey);
    }
    setStatus("saved", null);
    if (input.savedIdleAfterMs && input.savedIdleAfterMs > 0) {
      const ms = input.savedIdleAfterMs;
      void schedule(ms, () => setStatus("idle", null));
    }
    input.onSuccess?.(snapshot);
    return { ok: true, snapshot };
  } catch (err) {
    const repoErr =
      err instanceof FantasyRepoError
        ? err
        : new FantasyRepoError("unknown", err instanceof Error ? err.message : String(err));
    const kind: "conflict" | "error" = repoErr.code === "version_conflict" ? "conflict" : "error";
    setStatus(kind, repoErr);
    return { ok: false, error: repoErr, kind };
  }
}

function schedule(ms: number, fn: () => void): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(() => {
      fn();
      resolve();
    }, ms);
  });
}

/**
 * Classifier used by tests and by inline error surfaces. Kept pure so
 * conflict handling is testable without spinning up React Query.
 */
export function classifyRepoError(err: FantasyRepoError): {
  isConflict: boolean;
  isPermission: boolean;
  isNetwork: boolean;
  isMapping: boolean;
  isValidation: boolean;
} {
  return {
    isConflict: err.code === "version_conflict",
    isPermission: err.code === "permission_denied" || err.code === "unauthenticated",
    isNetwork: err.code === "network",
    isMapping: err.code === "mapping_incomplete",
    isValidation: err.code === "validation",
  };
}
