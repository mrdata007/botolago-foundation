import { beforeEach, describe, expect, test } from "bun:test";
import {
  MOCK_NOTIFICATION_USER_ID,
  MockNotificationDeviceRepository,
  MockNotificationEmailUnsubscribeRepository,
  MockNotificationPreferenceRepository,
  MockNotificationRepository,
  resetNotificationMocks,
} from "./mock-repositories";

const context = { actorId: MOCK_NOTIFICATION_USER_ID, requestId: "test" };

describe("notification mock repository contracts", () => {
  beforeEach(resetNotificationMocks);

  test("supports unread, mark-read, and mark-all behavior", async () => {
    const repository = new MockNotificationRepository();
    expect(await repository.unreadCount(null, context)).toBe(1);
    const card = (await repository.list({}, context)).items[0]!;
    await repository.markRead(card.id, true, context);
    expect(await repository.unreadCount(null, context)).toBe(0);
    await repository.markRead(card.id, false, context);
    expect(await repository.markAllRead("football", context)).toBe(1);
  });

  test("updates canonical preference DTOs", async () => {
    const repository = new MockNotificationPreferenceRepository();
    const current = await repository.get(context);
    const updated = await repository.update(
      { ...current, channels: { ...current.channels, push: true } },
      "ar",
      context,
    );
    expect(updated.channels.push).toBe(true);
    expect(updated.language).toBe("ar");
  });

  test("e-mail is on by default and a non-empty unsubscribe token turns it off", async () => {
    const preferences = new MockNotificationPreferenceRepository();
    const unsubscribe = new MockNotificationEmailUnsubscribeRepository();
    expect((await preferences.get(context)).channels.email).toBe(true);
    expect(await unsubscribe.unsubscribe("   ")).toEqual({ status: "invalid", topic: null });
    expect((await preferences.get(context)).channels.email).toBe(true);
    expect(await unsubscribe.unsubscribe("mock-token")).toEqual({
      status: "unsubscribed",
      topic: null,
    });
    expect((await preferences.get(context)).channels.email).toBe(false);
  });

  test("rotates one device without exposing its destination", async () => {
    const repository = new MockNotificationDeviceRepository();
    const device = await repository.register(
      {
        deviceId: "device-123456",
        platform: "web",
        pushProvider: "fixture",
        destination: "private-fixture-destination",
        locale: "fr",
        timezone: "Africa/Casablanca",
      },
      context,
    );
    expect(device).not.toHaveProperty("destination");
    expect(await repository.list(context)).toHaveLength(1);
  });
});
