export const BACKEND_ERROR_CODES = [
  "unauthenticated",
  "forbidden",
  "not_found",
  "conflict",
  "validation_failed",
  "rate_limited",
  "session_expired",
  "service_unavailable",
  "timeout",
  "provider_unavailable",
  "provider_rate_limited",
  "invalid_provider_payload",
  "mapping_not_found",
  "mapping_collision",
  "stale_update",
  "fixture_not_found",
  "team_not_found",
  "competition_not_supported",
  "invalid_fixture_state",
  "partial_sync_failure",
  "ingestion_conflict",
  "data_unavailable",
  "notification_not_found",
  "notification_access_denied",
  "invalid_notification_preference",
  "invalid_device",
  "device_token_conflict",
  "invalid_deep_link",
  "template_not_found",
  "template_variable_missing",
  "delivery_provider_unavailable",
  "delivery_rate_limited",
  "delivery_permanently_failed",
  "notification_duplicate",
  "event_schema_unsupported",
  "schedule_conflict",
  "quiet_hours_invalid",
  "email_unverified",
  "push_not_configured",
  "notification_channel_disabled",
  "fantasy_team_not_found",
  "fantasy_team_already_exists",
  "fantasy_season_closed",
  "fantasy_pilot_full",
  "fantasy_gameweek_locked",
  "fantasy_gameweek_not_found",
  "invalid_team_name",
  "invalid_squad",
  "invalid_formation",
  "budget_exceeded",
  "club_limit_exceeded",
  "duplicate_player",
  "player_not_eligible",
  "captain_invalid",
  "vice_captain_invalid",
  "version_conflict",
  "insufficient_free_transfers",
  "invalid_transfer",
  "chip_unavailable",
  "chip_already_used",
  "chip_conflict",
  "free_hit_snapshot_missing",
  "gameweek_not_finalizable",
  "scoring_incomplete",
  "league_not_found",
  "league_access_denied",
  "invite_code_invalid",
  "public_recap_disabled",
  "public_recap_not_final",
  "public_recap_alias_invalid",
  "public_recap_not_found",
  "duplicate_membership",
  "ranking_unavailable",
  "admin_context_unavailable",
  "staff_access_denied",
  "staff_user_not_found",
  "staff_user_ambiguous",
  "staff_user_not_verified",
  "staff_user_mfa_required",
  "staff_principal_already_exists",
  "staff_principal_not_found",
  "staff_principal_suspended",
  "staff_principal_revoked",
  "staff_assignment_not_found",
  "staff_role_invalid",
  "staff_role_expired",
  "staff_role_conflict",
  "role_assignment_not_found",
  "role_assignment_conflict",
  "role_assignment_expired",
  "role_assignment_already_revoked",
  "role_not_assignable",
  "staff_suspended",
  "staff_revoked",
  "permission_missing",
  "self_escalation_forbidden",
  "recent_auth_required",
  "mfa_required",
  "mfa_assurance_insufficient",
  "approval_required",
  "approval_not_found",
  "approval_expired",
  "approval_conflict",
  "approval_payload_mismatch",
  "self_approval_forbidden",
  "operation_already_executed",
  "last_platform_admin_required",
  "audit_access_denied",
  "assignment_not_found",
  "assignment_conflict",
  "revocation_request_not_found",
  "revocation_already_processed",
  "revocation_temporary_failure",
  "revocation_permanent_failure",
  "revocation_queued",
  "revocation_provider_unsupported",
  "worker_unavailable",
  "idempotency_conflict",
  "internal",
] as const;

export type BackendErrorCode = (typeof BACKEND_ERROR_CODES)[number];

export type ErrorMetadata = Readonly<Record<string, string | number | boolean | null>>;

export interface BackendErrorOptions {
  readonly status: number;
  readonly retryable?: boolean;
  readonly metadata?: ErrorMetadata;
  readonly cause?: unknown;
}

/** Stable internal error. Raw provider/database messages must not cross an API boundary. */
export class BackendError extends Error {
  readonly code: BackendErrorCode;
  readonly status: number;
  readonly retryable: boolean;
  readonly metadata?: ErrorMetadata;

  constructor(code: BackendErrorCode, message: string, options: BackendErrorOptions) {
    super(message, { cause: options.cause });
    this.name = "BackendError";
    this.code = code;
    this.status = options.status;
    this.retryable = options.retryable ?? false;
    this.metadata = options.metadata;
  }
}

export interface PublicBackendError {
  readonly code: BackendErrorCode;
  readonly message: string;
  readonly retryable: boolean;
  readonly requestId?: string;
}

export function isBackendError(error: unknown): error is BackendError {
  return error instanceof BackendError;
}

export function normalizeBackendError(error: unknown): BackendError {
  if (isBackendError(error)) return error;

  return new BackendError("internal", "An unexpected error occurred.", {
    status: 500,
    retryable: false,
    cause: error,
  });
}

export function toPublicBackendError(error: unknown, requestId?: string): PublicBackendError {
  const normalized = normalizeBackendError(error);

  return {
    code: normalized.code,
    message: normalized.message,
    retryable: normalized.retryable,
    ...(requestId ? { requestId } : {}),
  };
}

/**
 * Mock repositories and the mock Auth service are built only when the data
 * mode is not "supabase", and the check is written inline at each call site:
 *
 *   const mock = import.meta.env.VITE_X_DATA_MODE === "supabase" ? undefined : new Mock();
 *
 * The bundler replaces `import.meta.env.VITE_X_DATA_MODE` with the literal
 * from `.env.production`, so in the production build the condition is constant,
 * the `new Mock()` branch is dead, and the mock class and its fixtures leave
 * the first-load JavaScript. In tests, dev and the demo build the variable is
 * not "supabase" and nothing changes.
 *
 * The mode selectors (`selectXDataMode`) still decide which repository is
 * used, and still refuse a production build that is not on Supabase; this only
 * covers the case that cannot occur, a selector that says "mock" in a build
 * that was compiled without the mock, and says so instead of falling back.
 */
export function requireMock<T>(mock: T | undefined, name: string): T {
  if (mock === undefined) {
    throw new Error(`The ${name} mock is not part of a Supabase build.`);
  }
  return mock;
}
