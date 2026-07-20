import { describe, expect, test } from "bun:test";
import type { NotificationEventEnvelope } from "../contracts";
import { processNotificationFanout } from "./fanout";
import type {
  ClaimedNotificationDelivery,
  NotificationAudienceMember,
  NotificationWorkerGateway,
} from "./gateway.server";

const event: NotificationEventEnvelope = {
  eventId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  eventType: "breaking_news",
  sourceDomain: "news",
  sourceEntityId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  targetUserId: null,
  occurredAt: "2030-01-01T12:00:00.000Z",
  schemaVersion: 1,
  deduplicationKey: "news:breaking:story-1",
  correlationId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  payload: { title: "BotolaGO" },
};

class FakeGateway implements NotificationWorkerGateway {
  checkpoints: boolean[] = [];
  audienceCalls = 0;
  claimCheckpoint: string | null = null;
  audienceCursors: (string | null)[] = [];
  async ingest() {
    return event.eventId;
  }
  async claimEvent() {
    return { claimed: true, checkpointUserId: this.claimCheckpoint };
  }
  async listAudience(
    _eventId: string,
    afterUserId: string | null,
  ): Promise<readonly NotificationAudienceMember[]> {
    this.audienceCursors.push(afterUserId);
    this.audienceCalls += 1;
    return this.audienceCalls === 1
      ? [
          {
            userId: "11111111-1111-4111-8111-111111111111",
            language: "fr",
            timezone: "Africa/Casablanca",
            quietHours: { enabled: false, start: null, end: null },
          },
          {
            userId: "22222222-2222-4222-8222-222222222222",
            language: "ar",
            timezone: "Africa/Casablanca",
            quietHours: { enabled: false, start: null, end: null },
          },
        ]
      : [];
  }
  async createNotification(_event: NotificationEventEnvelope, userId: string) {
    return userId.startsWith("1") ? "dddddddd-dddd-4ddd-8ddd-dddddddddddd" : null;
  }
  async checkpoint(
    _eventId: string,
    _checkpointUserId: string | null,
    _counters: { audience: number; created: number; skipped: number; rejected: number },
    complete: boolean,
  ) {
    this.checkpoints.push(complete);
  }
  async claimDeliveries(): Promise<readonly ClaimedNotificationDelivery[]> {
    return [];
  }
  async recordDelivery() {}
  async invalidateDevice() {}
}

describe("notification fan-out", () => {
  test("batches, skips disabled users, and checkpoints completion", async () => {
    const gateway = new FakeGateway();
    const result = await processNotificationFanout(event, gateway, 2);
    expect(result).toEqual({ audience: 2, created: 1, skipped: 1, rejected: 0, batches: 1 });
    expect(gateway.checkpoints).toEqual([false, true]);
  });

  test("resumes after the last committed audience cursor", async () => {
    const gateway = new FakeGateway();
    gateway.claimCheckpoint = "99999999-9999-4999-8999-999999999999";
    await processNotificationFanout(event, gateway, 2);
    expect(gateway.audienceCursors[0]).toBe(gateway.claimCheckpoint);
  });
});
