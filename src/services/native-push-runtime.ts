import { nativePlatform } from "@/lib/native-app";
import { getNotificationRepositories, notificationContext } from "@/services/notifications";

import {
  forgetThisPhone,
  normalizePermission,
  type PushDeps,
  type PushPermission,
} from "./native-push";

/**
 * The real phone behind `native-push.ts`: Capacitor's plugins, this phone's
 * identity, and the app's notification repositories. Nothing here runs in a
 * browser or on the server: every entry point answers `null` (or does nothing)
 * unless the page is inside the phone app, and the plugins are only loaded then.
 */

const DEVICE_ID_KEY = "botolago.push.device-id";
const DEVICE_ID_SHAPE = /^[A-Za-z0-9._:-]{8,128}$/;

type PreferencesPlugin = (typeof import("@capacitor/preferences"))["Preferences"];

/** This install's id on the server: made once, kept, and never the phone's own hardware id. */
async function ensureDeviceId(preferences: PreferencesPlugin): Promise<string> {
  const stored = (await preferences.get({ key: DEVICE_ID_KEY })).value;
  if (stored && DEVICE_ID_SHAPE.test(stored)) return stored;
  const id = `bg-${globalThis.crypto.randomUUID()}`;
  await preferences.set({ key: DEVICE_ID_KEY, value: id });
  return id;
}

export async function loadNativePushDeps(locale: "fr" | "ar"): Promise<PushDeps | null> {
  const platform = nativePlatform();
  if (!platform) return null;
  const [{ PushNotifications }, { Preferences }, { App }] = await Promise.all([
    import("@capacitor/push-notifications"),
    import("@capacitor/preferences"),
    import("@capacitor/app"),
  ]);
  const [deviceId, info] = await Promise.all([
    ensureDeviceId(Preferences),
    App.getInfo().catch(() => null),
  ]);
  return {
    plugin: PushNotifications,
    identity: {
      platform,
      deviceId,
      appVersion: info?.version ?? null,
      locale,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    },
    devices: getNotificationRepositories().devices,
    context: notificationContext,
  };
}

/** What the phone currently says about notification permission; `null` outside the app. */
export async function loadNativePushPermission(): Promise<PushPermission | null> {
  if (!nativePlatform()) return null;
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    return normalizePermission((await PushNotifications.checkPermissions()).receive);
  } catch {
    return null;
  }
}

/** Sign-out: lets this phone go before the session ends. A no-op in a browser. */
export async function releaseThisPhone(locale: "fr" | "ar"): Promise<void> {
  if (!nativePlatform()) return;
  try {
    const deps = await loadNativePushDeps(locale);
    if (deps) await forgetThisPhone(deps);
  } catch {
    // A sign-out is never held back by this.
  }
}
