import type { RepositoryContext } from "@/backend/contracts/repository";
import type { CandidateDto, ProposalDto, ProposeItem } from "../mapping-contracts";
import { mapMappingError } from "../mapping-errors";
import type { PlayerMappingRepository } from "../mapping-repository";
import { loadAllCandidates, loadAllProposals, mapWithConcurrency } from "../review-queue";
import { deterministicUuid } from "./canonical";
import { MAX_PROPOSE_PER_CALL, type BulkPhase, type BulkRowState } from "./contract";
import type { BulkManifestBase, BulkProfile, BulkRowBase } from "./profile";
import {
  approvalIsOld,
  batchProposalFor,
  deriveAllRowStates,
  type RowStateInfo,
} from "./row-state";
import { sofascoreProfile } from "./sofascore-profile";

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

export const bulkKey = (manifest: Pick<BulkManifestBase, "manifestSha256">, ...parts: string[]) =>
  deterministicUuid([manifest.manifestSha256, ...parts].join("|"));

/** Everything a phase starts from: every candidate and every proposal, read now. */
export async function loadSnapshot<R extends BulkRowBase>(
  deps: BulkDeps,
  profile?: BulkProfile<R>,
  rows: readonly R[] = [],
) {
  const context = deps.context();
  const [candidates, proposals] = await Promise.all([
    loadAllCandidates(deps.repository, {}, context),
    loadAllProposals(deps.repository, null, context),
  ]);
  // The mapping rows the batch rests on (if any), read from the database now, never remembered.
  let providerMappings:
    | Awaited<ReturnType<NonNullable<BulkProfile<R>["loadSupporting"]>>>
    | undefined;
  if (profile?.loadSupporting) {
    try {
      providerMappings = await profile.loadSupporting(deps, rows);
    } catch (error) {
      // A refused session stops everything. Anything else (the read function missing on a database that
      // does not have the migration, a network error) only means "not read": each row's own check reads
      // again before anything is sent, and fails on its own.
      if (SESSION_CODES.has(mapMappingError(error).code)) throw error;
      providerMappings = undefined;
    }
  }
  return { candidates, proposals, providerMappings };
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

/**
 * "Already open" after a lost answer means OUR proposal landed; after a race it means
 * someone else's did. Only the first is progress: a foreign open proposal is a conflict.
 */
async function openProposalIsOurs<R extends BulkRowBase>(
  deps: BulkDeps,
  row: R,
  profile: BulkProfile<R>,
): Promise<boolean> {
  try {
    const context = deps.context();
    const candidate = await deps.repository.getMappingCandidate(row.candidateId, context);
    if (!candidate.openProposalId) return false;
    const proposal = await deps.repository.getMappingProposal(candidate.openProposalId, context);
    return batchProposalFor(row, [proposal], profile) !== null;
  } catch {
    return false;
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

const selectedRows = <R extends BulkRowBase>(
  manifest: BulkManifestBase<R>,
  selected: ReadonlySet<string>,
) => manifest.rows.filter((r) => selected.has(r.candidateId));

const defaultProfile = <R extends BulkRowBase>() => sofascoreProfile as unknown as BulkProfile<R>;

/**
 * How many propose calls the selected rows need: one set of calls per reason group, at
 * most 25 rows to a call. Derived from the selection, never a fixed number.
 */
export function proposeCallCount<R extends BulkRowBase>(
  profile: BulkProfile<R>,
  rows: readonly R[],
): number {
  return profile.groups.reduce(
    (n, group) =>
      n + Math.ceil(rows.filter((r) => profile.groupOf(r) === group).length / MAX_PROPOSE_PER_CALL),
    0,
  );
}

/** Rows left as found (not in this phase's state) are reported with their real state, untouched. */
function untouched(row: BulkRowBase, info: RowStateInfo | undefined): RowOutcome {
  return asOutcome(
    row.candidateId,
    info?.state ?? "ERROR",
    info?.code ?? null,
    info?.proposalId ?? null,
    false,
  );
}

/* ------------------------------------------------------------------ PROPOSE */

export async function runPropose<R extends BulkRowBase = BulkRowBase>(
  deps: BulkDeps,
  manifest: BulkManifestBase<R>,
  selected: ReadonlySet<string>,
  hooks: PhaseHooks = {},
  profile: BulkProfile<R> = defaultProfile<R>(),
): Promise<PhaseResult> {
  const now = (deps.now ?? (() => new Date()))();
  const snapshot = await loadSnapshot(deps, profile, manifest.rows);
  const states = deriveAllRowStates(
    manifest,
    snapshot.candidates,
    snapshot.proposals,
    now,
    profile,
    snapshot.providerMappings,
  );
  const outcomes = new Map<string, RowOutcome>();
  const emit = (o: RowOutcome) => {
    outcomes.set(o.candidateId, o);
    hooks.onRow?.(o);
  };

  const todo: R[] = [];
  for (const row of selectedRows(manifest, selected)) {
    const info = states.get(row.candidateId);
    if (info?.state === "NOT_PROPOSED") todo.push(row);
    else emit(untouched(row, info));
  }

  // 1. Re-check every row against the database; a row that moved is skipped, never replaced.
  const ready: R[] = [];
  let aborted: PhaseResult["aborted"] = null;
  await mapWithConcurrency(todo, 4, async (row) => {
    if (aborted || hooks.signal?.aborted) return;
    try {
      const verdict = await profile.revalidate(deps, row, snapshot);
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
  //    bounded set of calls per reason group, in manifest order.
  for (const group of profile.groups) {
    const rows = ready
      .filter((r) => profile.groupOf(r) === group)
      .sort((a, b) => (a.candidateId < b.candidateId ? -1 : 1));
    for (const part of chunk(rows, MAX_PROPOSE_PER_CALL)) {
      if (hooks.signal?.aborted) break;
      const items: ProposeItem[] = part.map((row) => profile.proposeItem(row));
      try {
        const key = await bulkKey(manifest, "propose", group, ...part.map((r) => r.candidateId));
        const result = await deps.repository.proposeMappings(
          items,
          profile.reasonOf(group),
          key,
          deps.context(),
        );
        for (const [index, row] of part.entries()) {
          const item = result.proposals.find((p) => p.index === index + 1);
          if (!item) {
            emit(asOutcome(row.candidateId, "ERROR", "no_result_for_row", null, false));
          } else if (!item.ok) {
            emit(
              item.code === "proposal_already_open" &&
                (await openProposalIsOurs(deps, row, profile))
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

export async function runApprove<R extends BulkRowBase = BulkRowBase>(
  deps: BulkDeps,
  manifest: BulkManifestBase<R>,
  selected: ReadonlySet<string>,
  hooks: PhaseHooks = {},
  profile: BulkProfile<R> = defaultProfile<R>(),
): Promise<PhaseResult> {
  const now = (deps.now ?? (() => new Date()))();
  const snapshot = await loadSnapshot(deps, profile, manifest.rows);
  const states = deriveAllRowStates(
    manifest,
    snapshot.candidates,
    snapshot.proposals,
    now,
    profile,
    snapshot.providerMappings,
  );
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
    const proposal = batchProposalFor(row, snapshot.proposals, profile)!;
    try {
      const result = await deps.repository.decideMappingProposal(
        {
          proposalId: proposal.id,
          decision: "approve",
          reason: profile.approvalReason,
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
async function executeBlocker<R extends BulkRowBase>(
  deps: BulkDeps,
  row: R,
  proposalId: string,
  now: Date,
  profile: BulkProfile<R>,
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
  // The row's own supporting evidence, from fresh reads, once more before the write.
  const extra = await profile.beforeExecute?.(deps, row);
  if (extra && !extra.ok) return block(extra.state, extra.code);
  return null;
}

export async function runExecute<R extends BulkRowBase = BulkRowBase>(
  deps: BulkDeps,
  manifest: BulkManifestBase<R>,
  selected: ReadonlySet<string>,
  hooks: PhaseHooks = {},
  profile: BulkProfile<R> = defaultProfile<R>(),
): Promise<PhaseResult> {
  const now = (deps.now ?? (() => new Date()))();
  const snapshot = await loadSnapshot(deps, profile, manifest.rows);
  const states = deriveAllRowStates(
    manifest,
    snapshot.candidates,
    snapshot.proposals,
    now,
    profile,
    snapshot.providerMappings,
  );
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
      const blocker = await executeBlocker(deps, row, info.proposalId, now, profile);
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
export function createBulkRunner<R extends BulkRowBase = BulkRowBase>(
  deps: BulkDeps,
  manifest: BulkManifestBase<R>,
  profile: BulkProfile<R> = defaultProfile<R>(),
): BulkRunner {
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
      const promise = fn(deps, manifest, selected, hooks, profile).finally(() => {
        inFlight = null;
      });
      inFlight = { phase, promise };
      return promise;
    },
  };
}
