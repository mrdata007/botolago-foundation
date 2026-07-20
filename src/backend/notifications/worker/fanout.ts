import type { NotificationEventEnvelope } from "../contracts";
import { validateNotificationEvent } from "../events";
import type { NotificationWorkerGateway } from "./gateway.server";

export interface FanoutResult {
  readonly audience: number;
  readonly created: number;
  readonly skipped: number;
  readonly rejected: number;
  readonly batches: number;
}

export async function processNotificationFanout(
  rawEvent: NotificationEventEnvelope,
  gateway: NotificationWorkerGateway,
  batchSize = 250,
): Promise<FanoutResult> {
  const event = validateNotificationEvent(rawEvent);
  if (batchSize < 1 || batchSize > 500) throw new RangeError("Fan-out batch size must be 1..500.");
  const claim = await gateway.claimEvent(event.eventId);
  if (!claim.claimed) return { audience: 0, created: 0, skipped: 0, rejected: 0, batches: 0 };
  let afterUserId = claim.checkpointUserId;
  const total = { audience: 0, created: 0, skipped: 0, rejected: 0, batches: 0 };
  while (true) {
    const audience = await gateway.listAudience(event.eventId, afterUserId, batchSize);
    if (audience.length === 0) {
      await gateway.checkpoint(
        event.eventId,
        afterUserId,
        { audience: 0, created: 0, skipped: 0, rejected: 0 },
        true,
      );
      return total;
    }
    const batch = { audience: audience.length, created: 0, skipped: 0, rejected: 0 };
    for (const member of audience) {
      try {
        const id = await gateway.createNotification(event, member.userId, {
          deepLinkTarget:
            event.sourceDomain === "football"
              ? "match_detail"
              : event.sourceDomain === "news"
                ? "article"
                : "security_action",
          deepLinkEntityId:
            event.sourceDomain === "football" || event.sourceDomain === "news"
              ? event.sourceEntityId
              : null,
          priority:
            event.sourceDomain === "identity" || event.eventType === "breaking_news"
              ? "high"
              : "normal",
        });
        if (id) batch.created += 1;
        else batch.skipped += 1;
      } catch {
        batch.rejected += 1;
      }
    }
    afterUserId = audience.at(-1)!.userId;
    total.audience += batch.audience;
    total.created += batch.created;
    total.skipped += batch.skipped;
    total.rejected += batch.rejected;
    total.batches += 1;
    const complete = audience.length < batchSize;
    await gateway.checkpoint(event.eventId, afterUserId, batch, complete);
    if (complete) return total;
  }
}
