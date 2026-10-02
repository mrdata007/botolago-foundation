import { createECDH } from "node:crypto";
import { describe, expect, test } from "bun:test";

import type { DeliveryMessage } from "./contracts";
import {
  buildWebPushPayload,
  isAllowedPushEndpoint,
  parsePushDestination,
  WebPushNotificationProvider,
} from "./web-push-adapter";
import { base64UrlEncode, generateVapidKeys } from "./web-push-crypto";

const ID = "6f1e0a62-3b1a-4c53-9a2e-0d1b2c3d4e5f";

function subscription(endpoint = "https://fcm.googleapis.com/fcm/send/abc") {
  const browser = createECDH("prime256v1");
  browser.generateKeys();
  return JSON.stringify({
    endpoint,
    keys: {
      p256dh: base64UrlEncode(browser.getPublicKey()),
      auth: base64UrlEncode(Buffer.alloc(16, 7)),
    },
  });
}

function message(reference: string, overrides: Partial<DeliveryMessage> = {}): DeliveryMessage {
  return {
    idempotencyKey: "delivery-1:1",
    channel: "push",
    destination: { reference },
    language: "fr",
    title: "Le match commence bientôt",
    body: "Wydad – Raja commence dans 15 min.",
    deepLink: { target: "match_detail", entityId: ID },
    ...overrides,
  };
}

function provider(respond: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const instance = new WebPushNotificationProvider({
    keys: generateVapidKeys(),
    subject: "mailto:ops@botolago.com",
    fetch: (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return respond(url, init);
    }) as unknown as typeof fetch,
  });
  return { instance, calls };
}

describe("push endpoints", () => {
  test("only https on the browsers' own push services", () => {
    for (const ok of [
      "https://fcm.googleapis.com/fcm/send/x",
      "https://updates.push.services.mozilla.com/wpush/v2/x",
      "https://web.push.apple.com/x",
      "https://db5p.notify.windows.com/?token=x",
    ])
      expect(isAllowedPushEndpoint(ok)).toBe(true);
    for (const bad of [
      "http://fcm.googleapis.com/x",
      "https://evil.example.com/x",
      "https://fcm.googleapis.com.evil.example.com/x",
      "https://user:pw@fcm.googleapis.com/x",
      "https://fcm.googleapis.com:8443/x",
      "https://169.254.169.254/latest",
      "not a url",
    ])
      expect(isAllowedPushEndpoint(bad)).toBe(false);
  });

  test("a destination needs real keys", () => {
    expect(parsePushDestination(subscription())).not.toBeNull();
    expect(parsePushDestination("{}")).toBeNull();
    expect(parsePushDestination("nope")).toBeNull();
    expect(
      parsePushDestination(
        JSON.stringify({
          endpoint: "https://fcm.googleapis.com/x",
          keys: { p256dh: "a", auth: "b" },
        }),
      ),
    ).toBeNull();
  });
});

describe("payload", () => {
  test("carries the page to open and the language direction", () => {
    const payload = buildWebPushPayload(message("x"), true);
    expect(payload.url).toBe(`/matches/${ID}`);
    expect(payload.dir).toBe("ltr");
    expect(buildWebPushPayload(message("x", { language: "ar" }), true).dir).toBe("rtl");
  });
  test("a notification with no page opens the inbox; long text is clipped", () => {
    expect(
      buildWebPushPayload(message("x", { deepLink: { target: "none", entityId: null } }), true).url,
    ).toBe("/notifications");
    const long = buildWebPushPayload(message("x", { body: "é".repeat(1000) }), true);
    expect([...long.body].length).toBeLessThanOrEqual(400);
  });
});

describe("WebPushNotificationProvider", () => {
  test("sends one encrypted, signed request to the browser's endpoint", async () => {
    const { instance, calls } = provider(() => new Response(null, { status: 201 }));
    const result = await instance.send(message(subscription()));
    expect(result).toMatchObject({
      stableErrorCode: null,
      invalidDestination: false,
      retryable: false,
    });
    expect(calls).toHaveLength(1);
    const headers = calls[0].init.headers as Record<string, string>;
    expect(calls[0].url).toBe("https://fcm.googleapis.com/fcm/send/abc");
    expect(headers["Content-Encoding"]).toBe("aes128gcm");
    expect(headers.Authorization).toMatch(/^vapid t=.+, k=.+$/);
    expect((calls[0].init.body as Uint8Array).length).toBeGreaterThan(100);
  });

  test("an endpoint outside the push services is never fetched", async () => {
    const { instance, calls } = provider(() => new Response(null, { status: 201 }));
    const result = await instance.send(message(subscription("https://evil.example.com/x")));
    expect(calls).toHaveLength(0);
    expect(result).toMatchObject({ invalidDestination: true, stableErrorCode: "invalid_device" });
  });

  test("a gone subscription is invalid; a busy service is retried; a bad request is final", async () => {
    const run = async (status: number, headers?: Record<string, string>) =>
      provider(() => new Response(null, { status, headers })).instance.send(
        message(subscription()),
      );
    expect(await run(410)).toMatchObject({ invalidDestination: true, retryable: false });
    expect(await run(404)).toMatchObject({ invalidDestination: true });
    expect(await run(429, { "Retry-After": "30" })).toMatchObject({
      retryable: true,
      stableErrorCode: "delivery_rate_limited",
    });
    expect(await run(503)).toMatchObject({
      retryable: true,
      stableErrorCode: "delivery_provider_error",
    });
    expect(await run(400)).toMatchObject({
      retryable: false,
      invalidDestination: false,
      stableErrorCode: "delivery_permanently_failed",
    });
  });

  test("a network failure is retried", async () => {
    const { instance } = provider(() => {
      throw new Error("offline");
    });
    expect(await instance.send(message(subscription()))).toMatchObject({
      retryable: true,
      stableErrorCode: "delivery_timeout",
    });
  });

  test("the result never carries the destination or the keys", async () => {
    const { instance } = provider(() => new Response(null, { status: 201 }));
    const text = JSON.stringify(await instance.send(message(subscription())));
    expect(text).not.toContain("fcm.googleapis.com");
    expect(text).not.toContain("p256dh");
  });
});
