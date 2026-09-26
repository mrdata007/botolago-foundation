import { reportMfaStepUp } from "@/backend/auth/step-up";
import { BackendError } from "@/backend/errors";

export const NOTIFICATION_ERROR_CODES = [
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
  "data_unavailable",
] as const;

export type NotificationErrorCode = (typeof NOTIFICATION_ERROR_CODES)[number];

export class NotificationError extends Error {
  constructor(
    readonly code: NotificationErrorCode,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message, { cause });
    this.name = "NotificationError";
  }
}

export function mapNotificationError(error: unknown): NotificationError {
  if (error instanceof NotificationError) return error;
  // A preference change refused because the second factor is still owed: the
  // auth layer takes the reader to the code (see `@/backend/auth/step-up`).
  reportMfaStepUp(error);
  const value = error as { message?: string; code?: string } | null;
  const message = `${value?.message ?? ""} ${value?.code ?? ""}`.toLowerCase();
  const code = NOTIFICATION_ERROR_CODES.find((candidate) => message.includes(candidate));
  if (code) return new NotificationError(code, publicMessage(code), error);
  if (message.includes("jwt") || message.includes("unauthorized") || message.includes("pt401"))
    return new NotificationError(
      "notification_access_denied",
      "Authentication is required.",
      error,
    );
  return new NotificationError(
    "data_unavailable",
    "Notifications are temporarily unavailable.",
    error,
  );
}

export function notificationErrorToBackend(error: unknown): BackendError {
  const mapped = mapNotificationError(error);
  const status =
    mapped.code === "notification_not_found" ? 404 : mapped.code.includes("conflict") ? 409 : 400;
  return new BackendError(mapped.code, mapped.message, { status, cause: error });
}

function publicMessage(code: NotificationErrorCode): string {
  switch (code) {
    case "notification_not_found":
      return "The notification was not found.";
    case "notification_access_denied":
      return "You cannot access this notification.";
    case "device_token_conflict":
      return "This notification destination is already registered.";
    case "delivery_rate_limited":
      return "Notification delivery is temporarily rate limited.";
    case "push_not_configured":
      return "Push delivery is not configured.";
    default:
      return "The notification request could not be completed.";
  }
}
