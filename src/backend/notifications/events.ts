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
const fantasyTransferPayload = z.object({
  transfer_count: z.number().int().positive().max(15),
  point_hit: z.number().int().nonnegative().max(100),
});
const fantasyChipPayload = z.object({
  chip: z.enum(["wildcard", "free_hit", "bench_boost", "triple_captain"]),
  gameweek: z.number().int().positive().max(1000),
});
const fantasyGameweekPayload = z.object({
  gameweek: z.number().int().positive().max(1000),
  points: z.number().int().min(-100).max(1000),
});
const fantasyLeaguePayload = z.object({
  league_name: z.string().min(1).max(80),
  rank: z.number().int().positive(),
});

const payloadSchemas = {
  match_starting: matchStartingPayload,
  goal: goalPayload,
  full_time: fullTimePayload,
  breaking_news: breakingNewsPayload,
  password_changed: z.object({}).strict(),
  account_deletion_requested: z.object({}).strict(),
  account_deletion_cancelled: z.object({}).strict(),
  sensitive_profile_change: z.object({}).strict(),
  transfer_confirmation: fantasyTransferPayload,
  chip_activated: fantasyChipPayload,
  gameweek_finalized: fantasyGameweekPayload,
  league_position_changed: fantasyLeaguePayload,
} as const;

export function validateNotificationEvent(value: unknown): NotificationEventEnvelope {
  const envelope = notificationEventEnvelopeSchema.parse(value);
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
  if (
    (envelope.sourceDomain === "identity" || envelope.sourceDomain === "fantasy") &&
    !envelope.targetUserId
  )
    throw new NotificationError(
      "event_schema_unsupported",
      "Identity and Fantasy events require a target user.",
    );
  return { ...envelope, payload: payload.data };
}
