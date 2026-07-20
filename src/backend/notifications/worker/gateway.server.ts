import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database, Json } from "@/backend/generated/database.types";
import {
  notificationEventEnvelopeSchema,
  notificationLanguageSchema,
  type NotificationEventEnvelope,
} from "../contracts";
import { mapNotificationError, NotificationError } from "../errors";
import { validateNotificationEvent } from "../events";

function serverClient(): SupabaseClient<Database> {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey)
    throw new NotificationError(
      "delivery_provider_unavailable",
      "Server notification credentials are not configured.",
    );
  return createClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

const audienceMemberSchema = z.object({
  userId: z.string().uuid(),
  language: notificationLanguageSchema,
  timezone: z.string(),
  quietHours: z.object({
    enabled: z.boolean(),
    start: z.string().nullable(),
    end: z.string().nullable(),
  }),
});

const claimedDeliverySchema = z.object({
  id: z.string().uuid(),
  notificationId: z.string().uuid(),
  channel: z.enum(["push", "email"]),
  providerKey: z.string(),
  deviceRegistrationId: z.string().uuid().nullable(),
  attemptNumber: z.number().int().positive(),
  title: z.string(),
  body: z.string(),
  language: notificationLanguageSchema,
  deepLink: z.object({ target: z.string(), entityId: z.string().uuid().nullable() }),
  destination: z.string().min(1),
});

export type NotificationAudienceMember = z.infer<typeof audienceMemberSchema>;
export type ClaimedNotificationDelivery = z.infer<typeof claimedDeliverySchema>;

export interface NotificationWorkerGateway {
  ingest(input: NotificationEventEnvelope): Promise<string>;
  claimEvent(
    eventId: string,
  ): Promise<{ readonly claimed: boolean; readonly checkpointUserId: string | null }>;
  listAudience(
    eventId: string,
    afterUserId: string | null,
    limit: number,
  ): Promise<readonly NotificationAudienceMember[]>;
  createNotification(
    event: NotificationEventEnvelope,
    userId: string,
    options?: {
      priority?: "low" | "normal" | "high" | "urgent";
      deepLinkTarget?: Database["app"]["Enums"]["notification_deep_link_target"];
      deepLinkEntityId?: string | null;
      expiresAt?: string | null;
    },
  ): Promise<string | null>;
  checkpoint(
    eventId: string,
    checkpointUserId: string | null,
    counters: { audience: number; created: number; skipped: number; rejected: number },
    complete: boolean,
  ): Promise<void>;
  claimDeliveries(limit: number): Promise<readonly ClaimedNotificationDelivery[]>;
  recordDelivery(
    delivery: ClaimedNotificationDelivery,
    result: {
      delivered: boolean;
      retryable: boolean;
      providerMessageId: string | null;
      stableErrorCode: string | null;
      latencyMs: number;
      rateLimitRemaining: number | null;
    },
  ): Promise<void>;
  invalidateDevice(deviceRegistrationId: string, reasonCode: string): Promise<void>;
}

export class SupabaseNotificationWorkerGateway implements NotificationWorkerGateway {
  constructor(private readonly client: SupabaseClient<Database> = serverClient()) {}

  async ingest(input: NotificationEventEnvelope): Promise<string> {
    const event = validateNotificationEvent(input);
    const { data, error } = await this.client
      .schema("api")
      .rpc("service_ingest_notification_event", {
        p_event_id: event.eventId,
        p_event_type: event.eventType,
        p_source_domain: event.sourceDomain,
        p_source_entity_id: event.sourceEntityId as string,
        p_target_user_id: event.targetUserId as string,
        p_occurred_at: event.occurredAt,
        p_schema_version: event.schemaVersion,
        p_deduplication_key: event.deduplicationKey,
        p_correlation_id: event.correlationId,
        p_safe_payload: event.payload as Json,
      });
    if (error) throw mapNotificationError(error);
    return z.string().uuid().parse(data);
  }

  async claimEvent(
    eventId: string,
  ): Promise<{ readonly claimed: boolean; readonly checkpointUserId: string | null }> {
    const { data, error } = await this.client
      .schema("api")
      .rpc("service_claim_notification_event", {
        p_event_id: eventId,
        p_lease_seconds: 120,
      });
    if (error) throw mapNotificationError(error);
    return z
      .object({
        claimed: z.boolean(),
        checkpointUserId: z.string().uuid().nullable().optional().default(null),
      })
      .parse(data);
  }

  async listAudience(
    eventId: string,
    afterUserId: string | null,
    limit: number,
  ): Promise<readonly NotificationAudienceMember[]> {
    const { data, error } = await this.client
      .schema("api")
      .rpc("service_list_notification_audience", {
        p_event_id: eventId,
        p_after_user_id: afterUserId ?? undefined,
        p_limit: limit,
      });
    if (error) throw mapNotificationError(error);
    return z.array(audienceMemberSchema).parse(data);
  }

  async createNotification(
    event: NotificationEventEnvelope,
    userId: string,
    options: {
      priority?: "low" | "normal" | "high" | "urgent";
      deepLinkTarget?: Database["app"]["Enums"]["notification_deep_link_target"];
      deepLinkEntityId?: string | null;
      expiresAt?: string | null;
    } = {},
  ): Promise<string | null> {
    const { data, error } = await this.client
      .schema("api")
      .rpc("service_create_user_notification", {
        p_event_id: event.eventId,
        p_user_id: userId,
        p_variables: event.payload as Json,
        p_priority: options.priority,
        p_deep_link_target: options.deepLinkTarget,
        p_deep_link_entity_id: options.deepLinkEntityId ?? undefined,
        p_expires_at: options.expiresAt ?? undefined,
        p_push_provider_key: process.env.NOTIFICATION_PUSH_PROVIDER ?? "fixture",
        p_email_provider_key: process.env.NOTIFICATION_EMAIL_PROVIDER ?? "fixture",
      });
    if (error) throw mapNotificationError(error);
    return data ? z.string().uuid().parse(data) : null;
  }

  async checkpoint(
    eventId: string,
    checkpointUserId: string | null,
    counters: { audience: number; created: number; skipped: number; rejected: number },
    complete: boolean,
  ): Promise<void> {
    const { error } = await this.client
      .schema("api")
      .rpc("service_checkpoint_notification_fanout", {
        p_event_id: eventId,
        p_checkpoint_user_id: checkpointUserId as string,
        p_audience_count: counters.audience,
        p_notifications_created: counters.created,
        p_deliveries_queued: 0,
        p_skipped_count: counters.skipped,
        p_rejected_count: counters.rejected,
        p_complete: complete,
      });
    if (error) throw mapNotificationError(error);
  }

  async claimDeliveries(limit: number): Promise<readonly ClaimedNotificationDelivery[]> {
    const { data, error } = await this.client
      .schema("api")
      .rpc("service_claim_notification_deliveries", {
        p_limit: limit,
        p_lease_seconds: 120,
      });
    if (error) throw mapNotificationError(error);
    return z.array(claimedDeliverySchema).parse(data);
  }

  async recordDelivery(
    delivery: ClaimedNotificationDelivery,
    result: {
      delivered: boolean;
      retryable: boolean;
      providerMessageId: string | null;
      stableErrorCode: string | null;
      latencyMs: number;
      rateLimitRemaining: number | null;
    },
  ): Promise<void> {
    const outcome = result.stableErrorCode
      ? result.retryable
        ? "retryable_failure"
        : "permanent_failure"
      : result.delivered
        ? "delivered"
        : "sent";
    const { error } = await this.client
      .schema("api")
      .rpc("service_record_notification_delivery_attempt", {
        p_delivery_id: delivery.id,
        p_outcome: outcome,
        p_retryable: result.retryable,
        p_provider_message_id: result.providerMessageId ?? undefined,
        p_stable_error_code: result.stableErrorCode ?? undefined,
        p_sanitized_summary: result.stableErrorCode ? "Provider delivery failed." : undefined,
        p_provider_latency_ms: result.latencyMs,
        p_rate_limit_remaining: result.rateLimitRemaining ?? undefined,
      });
    if (error) throw mapNotificationError(error);
  }

  async invalidateDevice(deviceRegistrationId: string, reasonCode: string): Promise<void> {
    const { error } = await this.client
      .schema("api")
      .rpc("service_invalidate_notification_device", {
        p_device_registration_id: deviceRegistrationId,
        p_reason_code: reasonCode,
      });
    if (error) throw mapNotificationError(error);
  }
}

export function parseWorkerEvent(value: unknown): NotificationEventEnvelope {
  return notificationEventEnvelopeSchema.parse(value);
}
