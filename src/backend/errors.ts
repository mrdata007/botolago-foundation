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
