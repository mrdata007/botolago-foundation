import type { RepositoryContext } from "@/backend/contracts/repository";
import type { CandidateDto, ProposalDto, ProposeItem } from "../mapping-contracts";
import { mapMappingError } from "../mapping-errors";
import type { PlayerMappingRepository } from "../mapping-repository";
import { loadAllCandidates, loadAllProposals, mapWithConcurrency } from "../review-queue";
import { deterministicUuid } from "./canonical";
import {
  BULK_APPROVAL_REASON,
  BULK_REASONS,
  MAX_PROPOSE_PER_CALL,
  type BulkPhase,
  type BulkRowState,
  type BulkTier,
} from "./contract";
import type { BulkManifest, ManifestRow } from "./manifest";
import {
  approvalIsOld,
  batchProposalFor,
  deriveAllRowStates,
  type RowStateInfo,
} from "./row-state";
import { revalidateRow } from "./revalidate";

export interface BulkDeps {
  readonly repository: PlayerMappingRepository;
  /** A fresh context per call (a new request id), like the rest of the screen. */
  readonly context: () => RepositoryContext;
  readonly now?: () => Date;
}

export interface RowOutcome {
  readonly candidateId: string;
  readonly state: BulkRowState;
  readonly code: string | null;
  readonly proposalId: string | null;
  /** True when this call did something to the row (as opposed to leaving it as found). */
  readonly acted: boolean;
}

export interface PhaseResult {
  readonly phase: BulkPhase;
  readonly outcomes: readonly RowOutcome[];
  /** Set when the session itself was refused (sign-in, second factor): nothing further was tried. */
  readonly aborted: { readonly code: string } | null;
}

export interface PhaseHooks {
  readonly onRow?: (outcome: RowOutcome) => void;
  readonly signal?: AbortSignal;
}

/** Refusals about the session, not about a row: stop at once rather than hammer the backend. */
const SESSION_CODES = new Set([
  "staff_access_denied",
  "permission_missing",
  "mfa_assurance_insufficient",
  "recent_auth_required",
  "not_authorized",
  "self_approval_denied",
  "self_approval_no_longer_allowed",
  "approver_no_longer_qualified",
]);

export const bulkKey = (manifest: Pick<BulkManifest, "manifestSha256">, ...parts: string[]) =>
  deterministicUuid([manifest.manifestSha256, ...parts].join("|"));

/** Everything a phase starts from: every candidate and every proposal, read now. */
export async function loadSnapshot(deps: BulkDeps) {
  const context = deps.context();
  const [candidates, proposals] = await Promise.all([
    loadAllCandidates(deps.repository, {}, context),
    loadAllProposals(deps.repository, null, context),
  ]);
  return { candidates, proposals };
}

const asOutcome = (
  candidateId: string,
  state: BulkRowState,
  code: string | null,
  proposalId: string | null,
  acted: boolean,
): RowOutcome => ({ candidateId, state, code, proposalId, acted });

/** Maps a refusal code the reviewed backend gave to the row state the screen shows. */
export function stateForRefusal(code: string): BulkRowState {
  switch (code) {
    case "stale_evidence":
    case "mapping_row_changed":
    case "fingerprint_mismatch":
      return "STALE_EVIDENCE";
    case "identity_conflict":
    case "proposal_already_open":
      return "IDENTITY_CONFLICT";
    case "already_mapped":
      return "TARGET_ALREADY_MAPPED";
    case "proposal_expired":
    case "approval_expired":
      return "APPROVAL_EXPIRED";
    case "position_disagreement":
    case "position_disagreement_unacknowledged":
      return "HELD";
    default:
      return "ERROR";
  }
}

/** `already_mapped` can mean the provider id or the target; one read tells which. */
async function refineAlreadyMapped(deps: BulkDeps, candidateId: string): Promise<BulkRowState> {
  try {
    const c = await deps.repository.getMappingCandidate(candidateId, deps.context());
    return c.status === "mapped" || c.existingMappingId
      ? "PROVIDER_ID_ALREADY_MAPPED"
      : "TARGET_ALREADY_MAPPED";
  } catch {
    return "TARGET_ALREADY_MAPPED";
  }
}

async function outcomeForCode(
  deps: BulkDeps,
  candidateId: string,
  code: string,
  proposalId: string | null,
): Promise<RowOutcome> {
  let state = stateForRefusal(code);
  if (code === "already_mapped") state = await refineAlreadyMapped(deps, candidateId);
  return asOutcome(candidateId, state, code, proposalId, true);
}

const chunk = <T>(items: readonly T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

const selectedRows = (manifest: BulkManifest, selected: ReadonlySet<string>) =>
  manifest.rows.filter((r) => selected.has(r.candidateId));

/** Rows left as found (not in this phase's state) are reported with their real state, untouched. */
function untouched(row: ManifestRow, info: RowStateInfo | undefined): RowOutcome {
  return asOutcome(
    row.candidateId,
    info?.state ?? "ERROR",
    info?.code ?? null,
    info?.proposalId ?? null,
    false,
  );
}

/* ------------------------------------------------------------------ PROPOSE */

export async function runPropose(
  deps: BulkDeps,
  manifest: BulkManifest,
  selected: ReadonlySet<string>,
  hooks: PhaseHooks = {},
): Promise<PhaseResult> {
  const now = (deps.now ?? (() => new Date()))();
  const snapshot = await loadSnapshot(deps);
  const states = deriveAllRowStates(manifest, snapshot.candidates, snapshot.proposals, now);
  const outcomes = new Map<string, RowOutcome>();
  const emit = (o: RowOutcome) => {
    outcomes.set(o.candidateId, o);
    hooks.onRow?.(o);
  };

  const todo: ManifestRow[] = [];
  for (const row of selectedRows(manifest, selected)) {
    const info = states.get(row.candidateId);
    if (info?.state === "NOT_PROPOSED") todo.push(row);
    else emit(untouched(row, info));
  }

  // 1. Re-check every row against the database; a row that moved is skipped, never replaced.
  const ready: ManifestRow[] = [];
  let aborted: PhaseResult["aborted"] = null;
  await mapWithConcurrency(todo, 4, async (row) => {
    if (aborted || hooks.signal?.aborted) return;
    try {
      const verdict = await revalidateRow(deps.repository, row, deps.context());
      if (verdict.ok) ready.push(row);
      else emit(asOutcome(row.candidateId, verdict.state, verdict.code, null, false));
    } catch (error) {
      const err = mapMappingError(error);
      if (SESSION_CODES.has(err.code)) aborted = { code: err.code };
      else emit(asOutcome(row.candidateId, "ERROR", err.code, null, false));
    }
  });
  if (aborted) return { phase: "propose", outcomes: [...outcomes.values()], aborted };

  // 2. The reviewed backend takes at most 100 per call, and one reason per call: so one
  //    bounded set of calls per tier, in manifest order.
  for (const tier of ["A", "B"] as const satisfies readonly BulkTier[]) {
    const rows = ready
      .filter((r) => r.tier === tier)
      .sort((a, b) => (a.candidateId < b.candidateId ? -1 : 1));
    for (const part of chunk(rows, MAX_PROPOSE_PER_CALL)) {
      if (hooks.signal?.aborted) break;
      const items: ProposeItem[] = part.map((row) => ({
        kind: "map",
        sofascoreCandidateId: row.candidateId,
        appPlayerId: row.appPlayerId,
        basis: "manual",
      }));
      try {
        const key = await bulkKey(manifest, "propose", tier, ...part.map((r) => r.candidateId));
        const result = await deps.repository.proposeMappings(
          items,
          BULK_REASONS[tier],
          key,
          deps.context(),
        );
        for (const [index, row] of part.entries()) {
          const item = result.proposals.find((p) => p.index === index + 1);
          if (!item) {
            emit(asOutcome(row.candidateId, "ERROR", "no_result_for_row", null, false));
          } else if (!item.ok) {
            emit(
              item.code === "proposal_already_open"
                ? asOutcome(row.candidateId, "PROPOSED", item.code, null, false)
                : await outcomeForCode(deps, row.candidateId, item.code, null),
            );
          } else if (item.fingerprint !== row.expectedFingerprint) {
            // Created, but not from the evidence that was reviewed: it is left pending and never approved here.
            emit(
              asOutcome(
                row.candidateId,
                "STALE_EVIDENCE",
                "fingerprint_differs_from_manifest",
                item.id,
                true,
              ),
            );
          } else {
            emit(asOutcome(row.candidateId, "PROPOSED", null, item.id, true));
          }
        }
      } catch (error) {
        const err = mapMappingError(error);
        if (SESSION_CODES.has(err.code)) {
          aborted = { code: err.code };
          break;
        }
        // The call is atomic and its key is deterministic: if it did land, a re-read shows it.
        for (const row of part) emit(asOutcome(row.candidateId, "ERROR", err.code, null, false));
      }
    }
    if (aborted) break;
  }
  return { phase: "propose", outcomes: [...outcomes.values()], aborted };
}

/* ------------------------------------------------------------------ APPROVE */

export async function runApprove(
  deps: BulkDeps,
  manifest: BulkManifest,
  selected: ReadonlySet<string>,
  hooks: PhaseHooks = {},
): Promise<PhaseResult> {
  const now = (deps.now ?? (() => new Date()))();
  const snapshot = await loadSnapshot(deps);
  const states = deriveAllRowStates(manifest, snapshot.candidates, snapshot.proposals, now);
  const outcomes = new Map<string, RowOutcome>();
  const emit = (o: RowOutcome) => {
    outcomes.set(o.candidateId, o);
    hooks.onRow?.(o);
  };
  let aborted: PhaseResult["aborted"] = null;

  // One proposal at a time, in manifest order, through the reviewed approval function.
  for (const row of selectedRows(manifest, selected)) {
    const info = states.get(row.candidateId);
    if (info?.state !== "PROPOSED" || !info.proposalId) {
      emit(untouched(row, info));
      continue;
    }
    if (aborted || hooks.signal?.aborted) continue;
    const proposal = batchProposalFor(row, snapshot.proposals)!;
    try {
      const result = await deps.repository.decideMappingProposal(
        {
          proposalId: proposal.id,
          decision: "approve",
          reason: BULK_APPROVAL_REASON,
          // The fingerprint the manifest froze, which the proposal was just shown to carry.
          fingerprint: row.expectedFingerprint,
        },
        await bulkKey(manifest, "approve", proposal.id),
        deps.context(),
      );
      emit(
        result.ok
          ? asOutcome(row.candidateId, "APPROVED", null, proposal.id, true)
          : await outcomeForCode(deps, row.candidateId, result.code, proposal.id),
      );
    } catch (error) {
      const err = mapMappingError(error);
      if (SESSION_CODES.has(err.code)) {
        aborted = { code: err.code };
        continue;
      }
      emit(await outcomeForCode(deps, row.candidateId, err.code, proposal.id));
    }
  }
  return { phase: "approve", outcomes: [...outcomes.values()], aborted };
}

/* ------------------------------------------------------------------ EXECUTE */

/** Re-reads one approved proposal and its candidate; null when it may be executed. */
async function executeBlocker(
  deps: BulkDeps,
  row: ManifestRow,
  proposalId: string,
  now: Date,
): Promise<RowOutcome | null> {
  const context = deps.context();
  const fresh: ProposalDto = await deps.repository.getMappingProposal(proposalId, context);
  const block = (state: BulkRowState, code: string) =>
    asOutcome(row.candidateId, state, code, proposalId, false);
  if (fresh.status === "executed")
    return asOutcome(row.candidateId, "EXECUTED", null, proposalId, false);
  if (fresh.status !== "approved")
    return block(
      fresh.status === "expired" ? "APPROVAL_EXPIRED" : "STALE_EVIDENCE",
      "proposal_not_approved",
    );
  if (fresh.effectiveStatus === "expired" || approvalIsOld(fresh, now))
    return block("APPROVAL_EXPIRED", "approval_expired");
  if (fresh.fingerprint !== row.expectedFingerprint)
    return block("STALE_EVIDENCE", "fingerprint_mismatch");
  const candidate: CandidateDto = await deps.repository.getMappingCandidate(
    row.candidateId,
    context,
  );
  if (candidate.status === "mapped" || candidate.existingMappingId)
    return block("PROVIDER_ID_ALREADY_MAPPED", "already_mapped");
  if (candidate.evidenceRevision !== row.evidenceRevision)
    return block("STALE_EVIDENCE", "evidence_revision_changed");
  return null;
}

export async function runExecute(
  deps: BulkDeps,
  manifest: BulkManifest,
  selected: ReadonlySet<string>,
  hooks: PhaseHooks = {},
): Promise<PhaseResult> {
  const now = (deps.now ?? (() => new Date()))();
  const snapshot = await loadSnapshot(deps);
  const states = deriveAllRowStates(manifest, snapshot.candidates, snapshot.proposals, now);
  const outcomes = new Map<string, RowOutcome>();
  const emit = (o: RowOutcome) => {
    outcomes.set(o.candidateId, o);
    hooks.onRow?.(o);
  };
  let aborted: PhaseResult["aborted"] = null;

  // One at a time. Each execution is its own guarded transaction: a refusal here never
  // touches another row, and nothing is retried.
  for (const row of selectedRows(manifest, selected)) {
    const info = states.get(row.candidateId);
    if (info?.state !== "APPROVED" || !info.proposalId) {
      emit(untouched(row, info));
      continue;
    }
    if (aborted || hooks.signal?.aborted) continue;
    try {
      const blocker = await executeBlocker(deps, row, info.proposalId, now);
      if (blocker) {
        emit(blocker);
        continue;
      }
      const result = await deps.repository.executeMappingProposal(
        info.proposalId,
        await bulkKey(manifest, "execute", info.proposalId),
        deps.context(),
      );
      emit(
        result.ok
          ? asOutcome(row.candidateId, "EXECUTED", null, info.proposalId, true)
          : await outcomeForCode(deps, row.candidateId, result.code, info.proposalId),
      );
    } catch (error) {
      const err = mapMappingError(error);
      if (SESSION_CODES.has(err.code)) {
        aborted = { code: err.code };
        continue;
      }
      emit(
        err.code === "operation_already_executed"
          ? asOutcome(row.candidateId, "EXECUTED", err.code, info.proposalId, false)
          : await outcomeForCode(deps, row.candidateId, err.code, info.proposalId),
      );
    }
  }
  return { phase: "execute", outcomes: [...outcomes.values()], aborted };
}

/* --------------------------------------------------------------- RE-ENTRANCY */

export interface BulkRunner {
  run(phase: BulkPhase, selected: ReadonlySet<string>, hooks?: PhaseHooks): Promise<PhaseResult>;
  readonly busy: boolean;
}

/**
 * One phase at a time. A second press of the same button while it runs gets the
 * SAME run back (no second call to the backend); a press of another phase is refused.
 * Across reloads, deterministic idempotency keys and the database-derived row states
 * give the same guarantee.
 */
export function createBulkRunner(deps: BulkDeps, manifest: BulkManifest): BulkRunner {
  let inFlight: { phase: BulkPhase; promise: Promise<PhaseResult> } | null = null;
  return {
    get busy() {
      return inFlight !== null;
    },
    run(phase, selected, hooks) {
      if (inFlight) {
        if (inFlight.phase === phase) return inFlight.promise;
        return Promise.reject(new Error("another_phase_is_running"));
      }
      const fn = phase === "propose" ? runPropose : phase === "approve" ? runApprove : runExecute;
      const promise = fn(deps, manifest, selected, hooks).finally(() => {
        inFlight = null;
      });
      inFlight = { phase, promise };
      return promise;
    },
  };
}
