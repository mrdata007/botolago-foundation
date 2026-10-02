// Browser side of phone alerts: what this device can do, and the exact shape
// the server stores. No network and no prompt here; the card asks only after a tap.

export type PushSupport = "supported" | "needs_home_screen" | "unsupported";

export function urlBase64ToUint8Array(value: string): Uint8Array {
  const padded = value + "=".repeat((4 - (value.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export interface SubscriptionJson {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
}

/** The stored destination: `{endpoint, keys:{p256dh,auth}}` (16–4096 characters), or null. */
export function serializePushSubscription(subscription: SubscriptionJson): string | null {
  const { endpoint, keys } = subscription;
  if (!endpoint || !keys?.p256dh || !keys.auth) return null;
  const text = JSON.stringify({ endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } });
  return text.length >= 16 && text.length <= 4096 ? text : null;
}

/** Only the public key is ever built in; a missing one keeps the feature off. */
export function isUsablePublicKey(value: string | undefined): value is string {
  if (!value || !/^[A-Za-z0-9_-]+$/.test(value)) return false;
  return urlBase64ToUint8Array(value).length === 65;
}

export function detectPushSupport(env: {
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  hasNotification: boolean;
  isIos: boolean;
  isStandalone: boolean;
}): PushSupport {
  if (env.isIos && !env.isStandalone) return "needs_home_screen";
  return env.hasServiceWorker && env.hasPushManager && env.hasNotification
    ? "supported"
    : "unsupported";
}

export function currentPushSupport(): PushSupport {
  if (typeof window === "undefined") return "unsupported";
  const ua = navigator.userAgent;
  const isIos =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true;
  return detectPushSupport({
    hasServiceWorker: "serviceWorker" in navigator,
    hasPushManager: "PushManager" in window,
    hasNotification: "Notification" in window,
    isIos,
    isStandalone: standalone,
  });
}

const DEVICE_KEY = "botolago.push-device-id";

/** A stable random id for this browser (8–128 of letters, digits, . _ : -). */
export function pushDeviceId(): string {
  try {
    const stored = localStorage.getItem(DEVICE_KEY);
    if (stored && /^[A-Za-z0-9._:-]{8,128}$/.test(stored)) return stored;
    const fresh = `web-${globalThis.crypto.randomUUID()}`;
    localStorage.setItem(DEVICE_KEY, fresh);
    return fresh;
  } catch {
    return `web-${globalThis.crypto.randomUUID()}`;
  }
}
