import { z } from "zod";

/**
 * The repository contract of the player-mapping workflow (migrations
 * 20261001160000 and 20261001161000). The future admin screen calls this and
 * nothing else: it infers no authority from the browser and never touches a
 * table. Every durable decision has a human proposer and a DIFFERENT human
 * approver; nothing here executes a decision on its own.
 */
export const MAPPING_PROVIDERS = ["sofascore", "flashscore"] as const;
export type MappingProvider = (typeof MAPPING_PROVIDERS)[number];

export const MAPPING_KINDS = [
  "map",
  "replace",
  "deactivate",
  "reactivate",
  "ignore",
  "reverse_ignore",
] as const;
export type MappingKind = (typeof MAPPING_KINDS)[number];

export const CANDIDATE_STATUSES = ["unmapped", "proposed", "mapped", "ignored"] as const;
export type CandidateStatus = (typeof CANDIDATE_STATUSES)[number];

export const PROPOSAL_STATUSES = [
  "pending",
  "approved",
  "executed",
  "rejected",
  "expired",
  "cancelled",
  "stale_evidence",
  "identity_conflict",
  "position_disagreement",
  "already_mapped",
] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

/** Flags a reviewer sees on a candidate. Information only: none rejects anyone. */
export const CANDIDATE_FLAGS = [
  "MULTI_SQUAD_OBSERVATION",
  "INCOMPLETE_PROVIDER_SQUAD",
  "REGISTERED_TEAM_DISAGREEMENT",
  "DOB_CONFLICT",
  "POSITION_DISAGREEMENT",
  "SHIRT_DIFFERENCE",
  "CLUB_CONTEXT_MISMATCH",
] as const;

/** Stable error codes the screen branches on. */
export const MAPPING_ERROR_CODES = [
  "staff_access_denied",
  "permission_missing",
  "mfa_assurance_insufficient",
  "recent_auth_required",
  "self_approval_denied",
  "self_approval_no_longer_allowed",
  "not_authorized",
  "proposal_not_found",
  "candidate_not_found",
  "proposal_expired",
  "approval_expired",
  "approver_no_longer_qualified",
  "fingerprint_mismatch",
  "proposal_not_pending",
  "proposal_not_approved",
  "proposal_not_open",
  "proposal_not_stale",
  "proposal_not_awaiting_note",
  "operation_already_executed",
  "position_disagreement_unacknowledged",
  "stale_evidence",
  "identity_conflict",
  "already_mapped",
  "proposal_already_open",
  "ignore_refused_id_in_lineup",
  "reason_required",
  "note_required",
  "invalid_proposal",
  "invalid_filter",
  "invalid_decision",
  "idempotency_conflict",
  "mapping_unavailable",
] as const;
export type MappingErrorCode = (typeof MAPPING_ERROR_CODES)[number];

/** Codes a proposal item can come back refused with (nothing is created for it). */
export const ITEM_REFUSAL_CODES = [
  "invalid_proposal",
  "candidate_not_found",
  "candidate_provider_mismatch",
  "app_player_not_found",
  "already_mapped",
  "identity_conflict",
  "proposal_already_open",
  "mapping_not_found",
  "mapping_provider_mismatch",
  "mapping_not_active",
  "mapping_already_active",
  "no_change",
  "already_ignored",
  "not_ignored",
  "ignore_refused_id_in_lineup",
] as const;

const uuid = z.string().uuid();
const isoDate = z.string().min(10);
const nullableString = z.string().nullable();

export const observationSchema = z.object({
  providerTeamId: z.string(),
  clubKey: nullableString,
  appTeamId: z.string().uuid().nullable(),
  squadCompleteness: z.enum(["COMPLETE", "INCOMPLETE_PROVIDER_SQUAD"]),
  registeredTeamId: nullableString,
  registeredTeamDisagreement: z.boolean(),
  shirtNumber: z.number().int().nullable(),
  position: z.enum(["G", "D", "M", "F"]).nullable(),
  dobState: z.string(),
  dobJanuary1: z.boolean(),
  heightCm: z.number().int().nullable(),
  nationality: nullableString,
  observedAt: isoDate,
});
export type ObservationDto = z.infer<typeof observationSchema>;

export const candidateSchema = z.object({
  id: uuid,
  provider: z.enum(MAPPING_PROVIDERS),
  externalId: z.string(),
  status: z.enum(CANDIDATE_STATUSES),
  statusChangedAt: isoDate,
  existingMappingId: uuid.nullable(),
  /** For a reviewer to READ. Never an input to anything that decides. */
  displayName: nullableString,
  displayNamePurgedAt: nullableString,
  lineupOrIncidentSeen: z.boolean(),
  evidenceRevision: z.number().int(),
  flags: z.array(z.string()),
  observations: z.array(observationSchema),
  openProposalId: uuid.nullable(),
});
export type CandidateDto = z.infer<typeof candidateSchema>;

export const proposalSchema = z.object({
  id: uuid,
  batchId: uuid,
  kind: z.enum(MAPPING_KINDS),
  status: z.enum(PROPOSAL_STATUSES),
  effectiveStatus: z.string(),
  sofascoreCandidateId: uuid.nullable(),
  flashscoreCandidateId: uuid.nullable(),
  sofascoreExternalId: nullableString,
  flashscoreExternalId: nullableString,
  providerName: z.enum(MAPPING_PROVIDERS).nullable(),
  mappingId: uuid.nullable(),
  appPlayerId: uuid.nullable(),
  newExternalId: nullableString,
  newAppPlayerId: uuid.nullable(),
  expectedBefore: z.record(z.string(), z.unknown()).nullable(),
  basis: z.enum(["incident", "shirt_position", "manual"]),
  evidence: z.record(z.string(), z.unknown()),
  signals: z.record(z.string(), z.unknown()),
  positionDisagreement: z.boolean(),
  positionNote: nullableString,
  positionDisagreementAcknowledged: z.boolean(),
  reason: z.string(),
  requestedBy: uuid,
  requestedAt: isoDate,
  expiresAt: isoDate,
  decidedBy: uuid.nullable(),
  decidedAt: nullableString,
  decisionReason: nullableString,
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  executedBy: uuid.nullable(),
  executedAt: nullableString,
  executedBefore: z.record(z.string(), z.unknown()).nullable(),
  executedAfter: z.record(z.string(), z.unknown()).nullable(),
  holdCode: nullableString,
  proposedByMe: z.boolean(),
  /** The proposer decided their own proposal (single-approver mode). */
  selfApproved: z.boolean().default(false),
  canApprove: z.boolean(),
});
export type ProposalDto = z.infer<typeof proposalSchema>;

export const proposeResultSchema = z.object({
  batchId: uuid,
  proposals: z.array(
    z.discriminatedUnion("ok", [
      z.object({
        index: z.number().int(),
        ok: z.literal(true),
        id: uuid,
        kind: z.enum(MAPPING_KINDS),
        status: z.enum(PROPOSAL_STATUSES),
        fingerprint: z.string(),
        positionDisagreement: z.boolean(),
      }),
      z.object({ index: z.number().int(), ok: z.literal(false), code: z.string() }),
    ]),
  ),
});
export type ProposeResult = z.infer<typeof proposeResultSchema>;

/** A transition that was remembered (a held state) comes back as ok:false, not as an error. */
export const transitionResultSchema = z.union([
  z.object({ ok: z.literal(true), id: uuid, status: z.string() }).passthrough(),
  z.object({ ok: z.literal(false), code: z.string(), status: z.string() }),
]);
export type TransitionResult = z.infer<typeof transitionResultSchema>;

export const reviewerAvailabilitySchema = z.object({
  qualifiedReviewersAvailable: z.number().int(),
  /** The database switch that lets a proposer approve their own proposal is on. */
  selfApprovalAllowed: z.boolean().default(false),
  secondReviewerRequired: z.boolean(),
});
export type ReviewerAvailability = z.infer<typeof reviewerAvailabilitySchema>;

export const appPlayerOptionSchema = z.object({
  appPlayerId: uuid,
  displayName: z.string(),
  position: z.enum(["G", "D", "M", "F"]).nullable(),
  signals: z.record(z.string(), z.unknown()),
  score: z.number().int(),
  alreadyMappedForProvider: z.boolean(),
});
export type AppPlayerOption = z.infer<typeof appPlayerOptionSchema>;

export type BasisInput = "incident" | "shirt_position" | "manual";

export type ProposeItem =
  | {
      readonly kind: "map";
      readonly sofascoreCandidateId?: string;
      readonly flashscoreCandidateId?: string;
      readonly appPlayerId: string;
      readonly basis?: BasisInput;
      /** References only (fixture ids, incident kinds, minutes). A name key is refused. */
      readonly evidenceRefs?: readonly Record<string, string | number>[];
    }
  | {
      readonly kind: "replace" | "reactivate";
      readonly providerName: MappingProvider;
      readonly mappingId: string;
      readonly newExternalId?: string;
      readonly newAppPlayerId?: string;
    }
  | {
      readonly kind: "deactivate";
      readonly providerName: MappingProvider;
      readonly mappingId: string;
    }
  | {
      readonly kind: "ignore" | "reverse_ignore";
      readonly sofascoreCandidateId?: string;
      readonly flashscoreCandidateId?: string;
    };

export interface CandidateFilter {
  readonly status?: CandidateStatus;
  readonly provider?: MappingProvider;
}
