import { BackendError } from "@/backend/errors";

export const ADMIN_ERROR_CODES = [
  "admin_context_unavailable",
  "unauthenticated",
  "staff_access_denied",
  "staff_principal_not_found",
  "staff_assignment_not_found",
  "staff_role_invalid",
  "staff_role_expired",
  "staff_role_conflict",
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
  "audit_access_denied",
  "assignment_not_found",
  "assignment_conflict",
  "revocation_request_not_found",
  "revocation_already_processed",
  "revocation_temporary_failure",
  "revocation_permanent_failure",
  "worker_unavailable",
  "idempotency_conflict",
] as const;

export type AdminErrorCode = (typeof ADMIN_ERROR_CODES)[number];

export class AdminError extends Error {
  constructor(
    readonly code: AdminErrorCode,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message, { cause });
    this.name = "AdminError";
  }
}

export function mapAdminError(error: unknown): AdminError {
  if (error instanceof AdminError) return error;
  const source = error as { message?: string; details?: string; code?: string } | null;
  const normalized =
    `${source?.message ?? ""} ${source?.details ?? ""} ${source?.code ?? ""}`.toLowerCase();
  const code = ADMIN_ERROR_CODES.find((candidate) => normalized.includes(candidate));
  if (code) return new AdminError(code, publicMessage(code), error);
  if (normalized.includes("pt401") || normalized.includes("42501")) {
    return new AdminError("staff_access_denied", "Staff access is denied.", error);
  }
  return new AdminError("staff_access_denied", "Staff access is denied.", error);
}

export function adminErrorToBackend(error: unknown): BackendError {
  const mapped = mapAdminError(error);
  const notFound =
    mapped.code === "staff_principal_not_found" ||
    mapped.code === "staff_assignment_not_found" ||
    mapped.code === "assignment_not_found" ||
    mapped.code === "revocation_request_not_found" ||
    mapped.code === "approval_not_found";
  const conflict =
    mapped.code.endsWith("_conflict") ||
    mapped.code === "approval_payload_mismatch" ||
    mapped.code === "revocation_already_processed" ||
    mapped.code === "operation_already_executed" ||
    mapped.code === "idempotency_conflict";
  const unavailable =
    mapped.code === "admin_context_unavailable" ||
    mapped.code === "revocation_temporary_failure" ||
    mapped.code === "worker_unavailable";
  return new BackendError(mapped.code, mapped.message, {
    status:
      mapped.code === "unauthenticated"
        ? 401
        : notFound
          ? 404
          : conflict
            ? 409
            : unavailable
              ? 503
              : 403,
    cause: error,
  });
}

function publicMessage(code: AdminErrorCode): string {
  switch (code) {
    case "unauthenticated":
      return "Authentication is required.";
    case "admin_context_unavailable":
    case "worker_unavailable":
      return "The administrative security service is unavailable.";
    case "recent_auth_required":
      return "Please authenticate again before continuing.";
    case "mfa_required":
      return "Multi-factor authentication must be enrolled.";
    case "mfa_assurance_insufficient":
      return "Complete the multi-factor authentication challenge.";
    case "approval_required":
      return "A second authorized staff member must approve this operation.";
    case "approval_expired":
      return "The approval request has expired.";
    case "approval_conflict":
      return "The approval request conflicts with its current state.";
    case "self_escalation_forbidden":
      return "Staff members cannot expand or approve their own access.";
    case "staff_suspended":
      return "This staff account is suspended.";
    case "staff_revoked":
      return "This staff account has been revoked.";
    case "staff_principal_not_found":
    case "staff_assignment_not_found":
    case "assignment_not_found":
    case "approval_not_found":
    case "revocation_request_not_found":
      return "The requested administrative record was not found.";
    case "revocation_already_processed":
      return "The session-revocation request has already been processed.";
    case "revocation_temporary_failure":
      return "Session invalidation is temporarily unavailable.";
    case "revocation_permanent_failure":
      return "The session-revocation request cannot be processed safely.";
    default:
      return "The administrative operation could not be completed.";
  }
}
