import { z } from "zod";
import { notificationEventEnvelopeSchema, type NotificationEventEnvelope } from "./contracts";
import { NotificationError } from "./errors";

const matchStartingPayload = z.object({
  home_team: z.string().min(1).max(100),
  away_team: z.string().min(1).max(100),
  minutes: z.number().int().min(0).max(1440),
});
const goalPayload = z.object({
  team: z.string().min(1).max(100),
  home_score: z.number().int().min(0).max(99),
  away_score: z.number().int().min(0).max(99),
});
const fullTimePayload = z.object({
  home_team: z.string().min(1).max(100),
  away_team: z.string().min(1).max(100),
  home_score: z.number().int().min(0).max(99),
  away_score: z.number().int().min(0).max(99),
});
const breakingNewsPayload = z.object({ title: z.string().min(1).max(240) });

const payloadSchemas = {
  match_starting: matchStartingPayload,
  goal: goalPayload,
  full_time: fullTimePayload,
  breaking_news: breakingNewsPayload,
  password_changed: z.object({}).strict(),
  account_deletion_requested: z.object({}).strict(),
  account_deletion_cancelled: z.object({}).strict(),
  sensitive_profile_change: z.object({}).strict(),
} as const;

export function validateNotificationEvent(value: unknown): NotificationEventEnvelope {
  const envelope = notificationEventEnvelopeSchema.parse(value);
  if (envelope.sourceDomain === "fantasy")
    throw new NotificationError(
      "event_schema_unsupported",
      "Fantasy notification handlers are disabled.",
    );
  const schema = payloadSchemas[envelope.eventType as keyof typeof payloadSchemas];
  if (!schema)
    throw new NotificationError(
      "event_schema_unsupported",
      "This notification event is not enabled.",
    );
  const payload = schema.safeParse(envelope.payload);
  if (!payload.success)
    throw new NotificationError(
      "event_schema_unsupported",
      "The event payload is invalid.",
      payload.error,
    );
  if (envelope.sourceDomain === "identity" && !envelope.targetUserId)
    throw new NotificationError(
      "event_schema_unsupported",
      "Identity events require a target user.",
    );
  return { ...envelope, payload: payload.data };
}
