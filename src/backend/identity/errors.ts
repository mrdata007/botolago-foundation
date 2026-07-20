export const IDENTITY_ERROR_CODES = [
  "invalid_username",
  "reserved_username",
  "username_taken",
  "invalid_profile",
  "unauthorized",
  "session_expired",
  "email_unverified",
  "invalid_reset_token",
  "rate_limited",
  "not_found",
  "ownership_conflict",
  "feature_unavailable",
  "network",
  "internal",
] as const;

export type IdentityErrorCode = (typeof IDENTITY_ERROR_CODES)[number];

export class IdentityError extends Error {
  readonly code: IdentityErrorCode;
  readonly retryable: boolean;
  readonly cause?: unknown;

  constructor(
    code: IdentityErrorCode,
    message: string,
    options?: { retryable?: boolean; cause?: unknown },
  ) {
    super(message);
    this.name = "IdentityError";
    this.code = code;
    this.retryable = options?.retryable ?? false;
    this.cause = options?.cause;
  }
}

interface SupabaseLikeError {
  readonly code?: string;
  readonly message?: string;
  readonly details?: string;
  readonly status?: number;
}

export function mapIdentityError(error: unknown): IdentityError {
  if (error instanceof IdentityError) return error;

  const source = (error ?? {}) as SupabaseLikeError;
  const code = source.code ?? "";
  const message = `${source.message ?? ""} ${source.details ?? ""}`.toUpperCase();

  if (source.status === 429 || code === "PT429" || message.includes("RATE_LIMITED")) {
    return new IdentityError("rate_limited", "Too many account requests.", {
      retryable: true,
      cause: error,
    });
  }
  if (code === "PT401" || code === "42501" || message.includes("UNAUTHORIZED")) {
    return new IdentityError("unauthorized", "Authentication is required.", { cause: error });
  }
  if (code === "PT404" || message.includes("PROFILE_NOT_FOUND")) {
    return new IdentityError("not_found", "The account record was not found.", { cause: error });
  }
  if (code === "PT409" || code === "23505" || message.includes("USERNAME_TAKEN")) {
    return new IdentityError("username_taken", "This username is already taken.", {
      cause: error,
    });
  }
  if (message.includes("RESERVED_USERNAME") || message.includes("USERNAME_RESERVED")) {
    return new IdentityError("reserved_username", "This username is reserved.", { cause: error });
  }
  if (message.includes("INVALID_USERNAME") || message.includes("USERNAME_INVALID")) {
    return new IdentityError("invalid_username", "The username is invalid.", { cause: error });
  }
  if (code === "PT400" || message.includes("INVALID_DISPLAY_NAME")) {
    return new IdentityError("invalid_profile", "The profile data is invalid.", { cause: error });
  }
  if (/FAILED TO FETCH|NETWORK|FETCHERROR/.test(message)) {
    return new IdentityError("network", "The identity service is unavailable.", {
      retryable: true,
      cause: error,
    });
  }

  return new IdentityError("internal", "The account operation could not be completed.", {
    cause: error,
  });
}
