import { createECDH } from "node:crypto";
import { describe, expect, test } from "bun:test";

import { base64UrlEncode, generateVapidKeys } from "../provider/web-push-crypto";
import type { ClaimedNotificationDelivery, NotificationWorkerGateway } from "./gateway.server";
import {
  PushRunnerConfigurationError,
  readPushRunnerConfiguration,
  runPushDispatch,
} from "./push-runner";

const keys = generateVapidKeys();
const env = {
  WEB_PUSH_VAPID_PUBLIC_KEY: keys.publicKey,
  WEB_PUSH_VAPID_PRIVATE_KEY: keys.privateKey,
  WEB_PUSH_SUBJECT: "mailto:ops@botolago.com",
};

function subscription(endpoint: string) {
  const browser = createECDH("prime256v1");
  browser.generateKeys();
  return JSON.stringify({
    endpoint,
    keys: {
      p256dh: base64UrlEncode(browser.getPublicKey()),
      auth: base64UrlEncode(Buffer.alloc(16, 3)),
    },
  });
}

function delivery(id: string, destination: string): ClaimedNotificationDelivery {
  return {
    id,
    notificationId: "11111111-1111-4111-8111-111111111111",
    channel: "push",
    providerKey: "web_push",
    deviceRegistrationId: `22222222-2222-4222-8222-22222222222${id.slice(-1)}`,
    attemptNumber: 1,
    title: "Le match commence bientôt",
    body: "Wydad – Raja commence dans 15 min.",
    language: "fr",
    deepLink: { target: "none", entityId: null },
    destination,
  };
}

function gatewayWith(deliveries: ClaimedNotificationDelivery[]) {
  const recorded: Array<{ id: string; delivered: boolean; code: string | null }> = [];
  const invalidated: string[] = [];
  const gateway = {
    claimDeliveries: async () => deliveries,
    recordDelivery: async (
      d: ClaimedNotificationDelivery,
      r: { delivered: boolean; stableErrorCode: string | null },
    ) => {
      recorded.push({ id: d.id, delivered: r.delivered, code: r.stableErrorCode });
    },
    invalidateDevice: async (id: string) => {
      invalidated.push(id);
    },
  } as unknown as NotificationWorkerGateway;
  return { gateway, recorded, invalidated };
}

describe("readPushRunnerConfiguration", () => {
  test("accepts a matching pair and a contact", () => {
    expect(readPushRunnerConfiguration(env).limit).toBe(100);
  });
  test("refuses missing, mismatched or malformed settings", () => {
    expect(() => readPushRunnerConfiguration({})).toThrow(PushRunnerConfigurationError);
    expect(() =>
      readPushRunnerConfiguration({
        ...env,
        WEB_PUSH_VAPID_PRIVATE_KEY: generateVapidKeys().privateKey,
      }),
    ).toThrow("does not match");
    expect(() => readPushRunnerConfiguration({ ...env, WEB_PUSH_SUBJECT: "ops" })).toThrow(
      "mailto",
    );
    expect(() => readPushRunnerConfiguration({ ...env, WEB_PUSH_BATCH_LIMIT: "1000" })).toThrow(
      "1 to 200",
    );
  });
});

describe("runPushDispatch", () => {
  test("sends what it claimed, records each result and retires a gone device", async () => {
    const { gateway, recorded, invalidated } = gatewayWith([
      delivery(
        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
        subscription("https://fcm.googleapis.com/fcm/send/ok"),
      ),
      delivery(
        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
        subscription("https://fcm.googleapis.com/fcm/send/gone"),
      ),
    ]);
    const fetched: string[] = [];
    const result = await runPushDispatch(gateway, env, {
      fetch: (async (url: string) => {
        fetched.push(url);
        return new Response(null, { status: url.endsWith("gone") ? 410 : 201 });
      }) as unknown as typeof fetch,
    });
    expect(result).toEqual({ claimed: 2, sent: 1, failed: 1, invalidatedDevices: 1 });
    expect(fetched).toHaveLength(2);
    expect(recorded.map((r) => r.code)).toEqual([null, "invalid_device"]);
    expect(invalidated).toHaveLength(1);
  });

  test("does nothing when nothing is queued", async () => {
    const { gateway } = gatewayWith([]);
    expect(await runPushDispatch(gateway, env)).toEqual({
      claimed: 0,
      sent: 0,
      failed: 0,
      invalidatedDevices: 0,
    });
  });

  test("refuses to start with bad settings, before claiming anything", async () => {
    let claimed = false;
    const gateway = {
      claimDeliveries: async () => {
        claimed = true;
        return [];
      },
    } as unknown as NotificationWorkerGateway;
    await expect(runPushDispatch(gateway, {})).rejects.toThrow(PushRunnerConfigurationError);
    expect(claimed).toBe(false);
  });
});
