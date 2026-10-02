import { useCallback, useEffect, useRef, useState } from "react";
import type { RepositoryContext } from "@/backend/contracts/repository";
import type {
  AppPlayerOption,
  CandidateDto,
  ProposalDto,
  ReviewerAvailability,
} from "@/backend/football/identity/mapping-contracts";
import { mapMappingError } from "@/backend/football/identity/mapping-errors";
import type { PlayerMappingRepository } from "@/backend/football/identity/mapping-repository";
import {
  classifyPreview,
  loadAllCandidates,
  loadAllProposals,
  loadOptions,
  mapWithConcurrency,
  plausibleOptionCount,
  type OptionScope,
  type Preview,
} from "@/backend/football/identity/review-queue";

/**
 * Data for the reviewer screen. Every read goes through the repository
 * contract (RPC functions the database authorises again); nothing here touches
 * a table, and nothing here writes.
 */
export interface QueueData {
  readonly candidates: readonly CandidateDto[];
  readonly proposals: readonly ProposalDto[];
  readonly availability: ReviewerAvailability;
}

export type LoadState<T> =
  | { readonly status: "loading"; readonly loaded: number }
  | { readonly status: "error"; readonly code: string }
  | { readonly status: "ready"; readonly data: T };

/** Reads every candidate (paged), every proposal, and the reviewer count. */
export function useQueueData(
  repository: PlayerMappingRepository | null,
  context: RepositoryContext,
): { state: LoadState<QueueData>; reload: () => void } {
  const [state, setState] = useState<LoadState<QueueData>>({ status: "loading", loaded: 0 });
  const [version, setVersion] = useState(0);
  const contextRef = useRef(context);
  contextRef.current = context;

  useEffect(() => {
    if (!repository) return;
    let cancelled = false;
    // A reload keeps what is on screen until the new data lands, so a reviewer
    // who just proposed is not thrown back to a skeleton.
    setState((current) =>
      current.status === "ready" ? current : { status: "loading", loaded: 0 },
    );
    (async () => {
      try {
        const ctx = contextRef.current;
        const candidates = await loadAllCandidates(repository, {}, ctx, {
          onPage: (loaded) => {
            if (!cancelled)
              setState((current) =>
                current.status === "ready" ? current : { status: "loading", loaded },
              );
          },
        });
        const [proposals, availability] = await Promise.all([
          loadAllProposals(repository, null, ctx),
          repository.getQualifiedReviewerAvailability(ctx),
        ]);
        if (!cancelled)
          setState({ status: "ready", data: { candidates, proposals, availability } });
      } catch (error) {
        if (!cancelled) setState({ status: "error", code: mapMappingError(error).code });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [repository, version]);

  return { state, reload: useCallback(() => setVersion((v) => v + 1), []) };
}

export type RowPreview =
  | { readonly status: "pending" }
  | { readonly status: "failed"; readonly code: string }
  | { readonly status: "ready"; readonly plausible: number; readonly preview: Preview };

/**
 * Computes, for the rows on screen only, how many app players are plausible and
 * which preview category the candidate reads as. At most four requests are in
 * flight; a row already computed is not asked for again. A row that fails says
 * so on its own and does not stop the others.
 */
export function useRowPreviews(
  repository: PlayerMappingRepository | null,
  context: RepositoryContext,
  rows: readonly CandidateDto[],
  enabled: boolean,
): ReadonlyMap<string, RowPreview> {
  const [previews, setPreviews] = useState<ReadonlyMap<string, RowPreview>>(new Map());
  const done = useRef(new Set<string>());
  const mounted = useRef(true);
  const contextRef = useRef(context);
  contextRef.current = context;
  const key = rows.map((r) => `${r.id}:${r.evidenceRevision}:${r.status}`).join(",");

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!repository || !enabled) return;
    const todo = rows.filter((row) => !done.current.has(`${row.id}:${row.evidenceRevision}`));
    if (todo.length === 0) return;
    for (const row of todo) done.current.add(`${row.id}:${row.evidenceRevision}`);
    setPreviews((current) => {
      const next = new Map(current);
      for (const row of todo) next.set(row.id, { status: "pending" });
      return next;
    });
    // Not cancelled when the page changes: a result for a row no longer on screen
    // is kept, so coming back to it costs nothing.
    void mapWithConcurrency(todo, 4, async (row) => {
      let result: RowPreview;
      try {
        const options = await loadOptions(repository, row, "club", contextRef.current);
        result = {
          status: "ready",
          plausible: plausibleOptionCount(options),
          preview: classifyPreview(row, options),
        };
      } catch (error) {
        // Forget it, so the next visit asks again.
        done.current.delete(`${row.id}:${row.evidenceRevision}`);
        result = { status: "failed", code: mapMappingError(error).code };
      }
      if (mounted.current)
        setPreviews((current) => {
          const next = new Map(current);
          next.set(row.id, result);
          return next;
        });
    });
    // `rows` is represented by `key`; the contents are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repository, enabled, key]);

  return previews;
}

/** The ranked options for the candidate being compared. */
export function useCandidateOptions(
  repository: PlayerMappingRepository | null,
  context: RepositoryContext,
  candidate: CandidateDto,
  scope: OptionScope,
  preloaded?: readonly AppPlayerOption[],
): LoadState<readonly AppPlayerOption[]> {
  const [state, setState] = useState<LoadState<readonly AppPlayerOption[]>>(
    preloaded ? { status: "ready", data: preloaded } : { status: "loading", loaded: 0 },
  );
  const contextRef = useRef(context);
  contextRef.current = context;
  const candidateRef = useRef(candidate);
  candidateRef.current = candidate;

  useEffect(() => {
    if (preloaded || !repository) return;
    let cancelled = false;
    setState({ status: "loading", loaded: 0 });
    loadOptions(repository, candidateRef.current, scope, contextRef.current)
      .then((options) => {
        if (!cancelled) setState({ status: "ready", data: options });
      })
      .catch((error) => {
        if (!cancelled) setState({ status: "error", code: mapMappingError(error).code });
      });
    return () => {
      cancelled = true;
    };
    // The evidence revision changes when the observations do.
  }, [repository, candidate.id, candidate.evidenceRevision, scope, preloaded]);

  return state;
}

/** What the screen can ask the database to do. Each is a human's request; none executes. */
export interface MappingActions {
  propose(candidate: CandidateDto, appPlayerId: string, reason: string): Promise<void>;
  decide(
    proposal: ProposalDto,
    decision: "approve" | "reject",
    reason: string,
    acknowledged: boolean,
  ): Promise<void>;
  cancel(proposal: ProposalDto, reason: string): Promise<void>;
  addNote(proposal: ProposalDto, note: string): Promise<void>;
  refreshEvidence(proposal: ProposalDto): Promise<void>;
}

/**
 * The actions over a repository. A held outcome (`ok: false`) is raised as the
 * refusal code the screen already knows how to say, so the reviewer is never
 * told something worked when the database remembered it as held.
 */
export function createMappingActions(
  repository: PlayerMappingRepository,
  context: () => RepositoryContext,
): MappingActions {
  const key = () => globalThis.crypto.randomUUID();
  const assertOk = (result: { ok?: boolean; code?: string }) => {
    if (result.ok === false)
      throw mapMappingError({ message: result.code ?? "mapping_unavailable" });
  };
  return {
    async propose(candidate, appPlayerId, reason) {
      const result = await repository.proposeMappings(
        [
          {
            kind: "map",
            ...(candidate.provider === "sofascore"
              ? { sofascoreCandidateId: candidate.id }
              : { flashscoreCandidateId: candidate.id }),
            appPlayerId,
            // A person chose this pairing by reading the evidence: say so, never "incident".
            basis: "manual",
          },
        ],
        reason,
        key(),
        context(),
      );
      const first = result.proposals[0];
      if (!first || !first.ok)
        throw mapMappingError({ message: first?.code ?? "invalid_proposal" });
    },
    async decide(proposal, decision, reason, acknowledged) {
      assertOk(
        await repository.decideMappingProposal(
          {
            proposalId: proposal.id,
            decision,
            reason,
            // The fingerprint the reviewer was shown, never one recomputed here.
            fingerprint: proposal.fingerprint,
            positionDisagreementAcknowledged: acknowledged,
          },
          key(),
          context(),
        ),
      );
    },
    async cancel(proposal, reason) {
      assertOk(await repository.cancelMappingProposal(proposal.id, reason, key(), context()));
    },
    async addNote(proposal, note) {
      assertOk(await repository.addPositionNote(proposal.id, note, key(), context()));
    },
    async refreshEvidence(proposal) {
      assertOk(await repository.refreshProposalEvidence(proposal.id, key(), context()));
    },
  };
}
