import { describe, expect, test } from "bun:test";
import { FixtureNotificationProvider } from "../provider/fixture-adapter";
import { dispatchNotificationBatch } from "./dispatcher";
import type { ClaimedNotificationDelivery, NotificationWorkerGateway } from "./gateway.server";

const delivery: ClaimedNotificationDelivery = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  notificationId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  channel: "push",
  providerKey: "fixture",
  deviceRegistrationId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  attemptNumber: 1,
  title: "But !",
  body: "Wydad marque.",
  language: "fr",
  deepLink: { target: "match_detail", entityId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" },
  destination: "private-fixture-destination",
};

class DeliveryGateway implements NotificationWorkerGateway {
  recorded = 0;
  invalidated = 0;
  async ingest() {
    return delivery.id;
  }
  async claimEvent() {
    return false;
  }
  async listAudience() {
    return [];
  }
  async createNotification() {
    return null;
  }
  async checkpoint() {}
  async claimDeliveries() {
    return [delivery];
  }
  async recordDelivery() {
    this.recorded += 1;
  }
  async invalidateDevice() {
    this.invalidated += 1;
  }
}

describe("notification dispatcher", () => {
  test("records successful fixture delivery", async () => {
    const gateway = new DeliveryGateway();
    const providers = new Map([["push:fixture", new FixtureNotificationProvider("push")]]);
    expect(await dispatchNotificationBatch(gateway, providers)).toEqual({
      claimed: 1,
      sent: 1,
      failed: 0,
      invalidatedDevices: 0,
    });
    expect(gateway.recorded).toBe(1);
  });

  test("invalidates permanent token failures", async () => {
    const gateway = new DeliveryGateway();
    const providers = new Map([
      ["push:fixture", new FixtureNotificationProvider("push", "invalid_destination")],
    ]);
    const result = await dispatchNotificationBatch(gateway, providers);
    expect(result.failed).toBe(1);
    expect(gateway.invalidated).toBe(1);
  });
});
