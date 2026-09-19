export const MFA_ERROR_CODES = [
  "invalid_code",
  "challenge_expired",
  "already_enrolled",
  "factor_not_found",
  "unauthorized",
  "rate_limited",
  "network",
  "internal",
] as const;

export type MfaErrorCode = (typeof MFA_ERROR_CODES)[number];

export class MfaError extends Error {
  readonly code: MfaErrorCode;
  readonly retryable: boolean;
  readonly cause?: unknown;

  constructor(
    code: MfaErrorCode,
    message: string,
    options?: { retryable?: boolean; cause?: unknown },
  ) {
    super(message);
    this.name = "MfaError";
    this.code = code;
    this.retryable = options?.retryable ?? false;
    this.cause = options?.cause;
  }
}

interface MfaLikeError {
  readonly message?: string;
  readonly status?: number;
}

export function mapMfaError(error: unknown): MfaError {
  if (error instanceof MfaError) return error;

  const source = (error ?? {}) as MfaLikeError;
  const message = (source.message ?? "").toLowerCase();
  const status = source.status ?? 0;

  if (status === 429 || message.includes("rate limit")) {
    return new MfaError("rate_limited", "Too many verification attempts.", {
      retryable: true,
      cause: error,
    });
  }
  if (status === 401 || message.includes("unauthorized") || message.includes("not authenticated")) {
    return new MfaError("unauthorized", "Authentication is required.", { cause: error });
  }
  if (message.includes("already enrolled") || message.includes("friendly name")) {
    return new MfaError("already_enrolled", "A factor with this name is already enrolled.", {
      cause: error,
    });
  }
  if (message.includes("factor not found") || message.includes("mfa factor")) {
    return new MfaError("factor_not_found", "The authentication factor was not found.", {
      cause: error,
    });
  }
  if (message.includes("expired") || message.includes("challenge")) {
    return new MfaError("challenge_expired", "The verification challenge expired. Try again.", {
      retryable: true,
      cause: error,
    });
  }
  if (message.includes("invalid") && (message.includes("code") || message.includes("totp"))) {
    return new MfaError("invalid_code", "The verification code is incorrect.", { cause: error });
  }
  if (/failed to fetch|network|fetcherror/.test(message)) {
    return new MfaError("network", "The authentication service is unavailable.", {
      retryable: true,
      cause: error,
    });
  }

  return new MfaError("internal", "The MFA operation could not be completed.", { cause: error });
}
