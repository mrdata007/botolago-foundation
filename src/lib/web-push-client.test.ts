import { describe, expect, test } from "bun:test";

import {
  detectPushSupport,
  isUsablePublicKey,
  serializePushSubscription,
  urlBase64ToUint8Array,
} from "@/lib/web-push-client";

const ok = { hasServiceWorker: true, hasPushManager: true, hasNotification: true };

describe("web push client", () => {
  test("decodes url-safe base64", () => {
    expect(Array.from(urlBase64ToUint8Array("AQID"))).toEqual([1, 2, 3]);
    expect(Array.from(urlBase64ToUint8Array("-_8"))).toEqual([251, 255]);
  });
  test("serializes only endpoint and keys, and refuses incomplete or huge ones", () => {
    const text = serializePushSubscription({
      endpoint: "https://fcm.googleapis.com/x",
      keys: { p256dh: "a", auth: "b" },
    });
    expect(JSON.parse(text as string)).toEqual({
      endpoint: "https://fcm.googleapis.com/x",
      keys: { p256dh: "a", auth: "b" },
    });
    expect(serializePushSubscription({ endpoint: "https://x" })).toBeNull();
    expect(
      serializePushSubscription({
        endpoint: "https://fcm.googleapis.com/" + "a".repeat(5000),
        keys: { p256dh: "a", auth: "b" },
      }),
    ).toBeNull();
  });
  test("a public key must be 65 bytes", () => {
    expect(isUsablePublicKey(undefined)).toBe(false);
    expect(isUsablePublicKey("AQID")).toBe(false);
    expect(isUsablePublicKey(btoa(String.fromCharCode(...new Uint8Array(65).fill(4))))).toBe(false);
    const key = btoa(String.fromCharCode(...new Uint8Array(65).fill(4)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(isUsablePublicKey(key)).toBe(true);
  });
  test("iPhone needs the Home Screen first", () => {
    expect(detectPushSupport({ ...ok, isIos: true, isStandalone: false })).toBe(
      "needs_home_screen",
    );
    expect(detectPushSupport({ ...ok, isIos: true, isStandalone: true })).toBe("supported");
    expect(detectPushSupport({ ...ok, isIos: false, isStandalone: false })).toBe("supported");
    expect(
      detectPushSupport({ ...ok, hasPushManager: false, isIos: false, isStandalone: false }),
    ).toBe("unsupported");
  });
});
