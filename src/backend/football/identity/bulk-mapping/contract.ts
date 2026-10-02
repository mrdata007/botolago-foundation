/**
 * The frozen contract of the controlled bulk-mapping batch (owner approval of
 * 2026-10-02). Nothing here decides who is mapped: the eligibility rules and the
 * manifest do, and the reviewed backend (propose, approve, execute) still checks
 * every row on its own. These are only the words and limits the batch uses.
 */
export const BULK_CONTRACT_VERSION = "player-mapping-bulk-v1";

/** Tier A: shirt agrees. Tier B: shirt gives no signal (never a conflict). */
export const BULK_TIERS = ["A", "B"] as const;
export type BulkTier = (typeof BULK_TIERS)[number];

/** The reviewed propose function accepts at most 100 items per call. Not weakened here. */
export const BACKEND_PROPOSE_LIMIT = 100;

/**
 * Items the batch sends per propose call. The backend stores each call's response under
 * its idempotency key, and that stored response may not exceed 8 KB (a check on
 * admin_idempotency_keys): about 34 proposals fit, so a call of 100 would be refused whole.
 * Twenty-five (about 6 KB) leaves margin. The database test proves 40 is refused and 25 is not.
 */
export const MAX_PROPOSE_PER_CALL = 25;

/** The reviewed execute function refuses an approval older than this. Mirrored, never relaxed. */
export const APPROVAL_VALIDITY_HOURS = 24;

/** Factual, per tier. No tier claims evidence the other lacks, and none says a name matched. */
export const BULK_REASONS: Readonly<Record<BulkTier, string>> = {
  A: "Batch-reviewed structured identity: exact DOB and current club agreement, matching position and shirt number, unique app-player target, and an existing active SportsMonks identity resolving to the same canonical player.",
  B: "Batch-reviewed structured identity: exact DOB and current club agreement, matching position, unique app-player target, and an existing active SportsMonks identity resolving to the same canonical player. Shirt number provides no signal and no shirt conflict is present.",
};

export const BULK_APPROVAL_REASON =
  "Reviewed the frozen batch evidence and confirmed the proposal still matches the approved structured identity manifest.";

/** What a person types before each of the three separate actions. Never translated. */
export const BULK_CONFIRMATION_PHRASES = {
  propose: "PROPOSE_REVIEWED_BATCH",
  approve: "APPROVE_REVIEWED_BATCH",
  execute: "EXECUTE_APPROVED_BATCH",
} as const;
export type BulkPhase = keyof typeof BULK_CONFIRMATION_PHRASES;

/**
 * Where a manifest row stands. Derived from the database on every load, so a
 * closed browser or a lost network never loses or repeats work.
 */
export const BULK_ROW_STATES = [
  "NOT_PROPOSED",
  "PROPOSED",
  "APPROVED",
  "EXECUTED",
  "STALE_EVIDENCE",
  "IDENTITY_CONFLICT",
  "TARGET_ALREADY_MAPPED",
  "PROVIDER_ID_ALREADY_MAPPED",
  "APPROVAL_EXPIRED",
  "HELD",
  "ERROR",
] as const;
export type BulkRowState = (typeof BULK_ROW_STATES)[number];

/** Key names a manifest may never carry: names, birth dates, raw provider payloads. */
export const FORBIDDEN_MANIFEST_KEYS: readonly RegExp[] = [
  /name/i,
  /birth/i,
  /dobvalue/i,
  /payload/i,
  /slug/i,
];
