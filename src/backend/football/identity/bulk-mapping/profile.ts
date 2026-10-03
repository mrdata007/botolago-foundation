import type { RepositoryContext } from "@/backend/contracts/repository";
import type {
  CandidateDto,
  ProposalDto,
  ProposeItem,
  ProviderMappingDto,
} from "../mapping-contracts";
import type { PlayerMappingRepository } from "../mapping-repository";
import type { BulkRowState } from "./contract";

/** What every batch row has, whichever provider it maps. */
export interface BulkRowBase {
  readonly candidateId: string;
  readonly externalId: string;
  readonly appPlayerId: string;
  readonly appTeamId: string | null;
  readonly evidenceRevision: number;
  readonly expectedFingerprint: string;
}

export interface BulkManifestBase<R extends BulkRowBase = BulkRowBase> {
  readonly manifestSha256: string;
  readonly rows: readonly R[];
}

/** Everything a phase starts from: every candidate and every proposal, read now. */
export interface PhaseSnapshot {
  readonly candidates: readonly CandidateDto[];
  readonly proposals: readonly ProposalDto[];
  /**
   * The actual mapping rows the batch's rows rest on, read now (see `loadSupporting`), keyed
   * `provider:externalId`. Absent for a batch that rests on none; a missing key means "not read".
   */
  readonly providerMappings?: ReadonlyMap<string, ProviderMappingDto | null>;
}

export type Revalidation =
  | { readonly ok: true }
  | { readonly ok: false; readonly state: BulkRowState; readonly code: string };

export interface ProfileDeps {
  readonly repository: PlayerMappingRepository;
  readonly context: () => RepositoryContext;
}

/**
 * What differs between batches: which candidate field a proposal uses, how rows are
 * grouped under one reason, what a row is re-checked against, and (for Flashscore) what
 * its supporting mapping must still be. Everything else (the three phases, the 25-per-call
 * limit, idempotency keys, database-derived state, the typed confirmations) is shared.
 */
export interface BulkProfile<R extends BulkRowBase = BulkRowBase> {
  readonly kind: "sofascore" | "flashscore";
  /** The proposal field that names this batch's candidate. */
  readonly candidateField: "sofascoreCandidateId" | "flashscoreCandidateId";
  /** Propose groups, in the order their calls are made. One reason per group (a call has one reason). */
  readonly groups: readonly string[];
  groupOf(row: R): string;
  reasonOf(group: string): string;
  readonly approvalReason: string;
  proposeItem(row: R): ProposeItem;
  /** Re-checks one row against the database immediately before it is proposed. */
  revalidate(
    deps: ProfileDeps,
    row: R,
    snapshot: PhaseSnapshot,
    preloaded?: CandidateDto,
  ): Promise<Revalidation>;
  /**
   * Re-checks the row immediately before one execution, from fresh reads. Absent when the
   * candidate re-read the runner always does is all the batch needs.
   */
  beforeExecute?(deps: ProfileDeps, row: R): Promise<Revalidation>;
  /**
   * Reads, from the database, the mapping rows the batch's rows rest on (one read each, a few at a
   * time). Absent for a batch that rests on none.
   */
  loadSupporting?(
    deps: ProfileDeps,
    rows: readonly R[],
  ): Promise<ReadonlyMap<string, ProviderMappingDto | null>>;
  /**
   * A refusal the row's resting state should show even before any phase runs (for example
   * its supporting mapping changed). Pure, over the data the screen already holds.
   */
  inspect?(row: R, snapshot: PhaseSnapshot): { state: BulkRowState; code: string } | null;
}
