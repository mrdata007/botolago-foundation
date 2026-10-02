import {
  currentPushSupport,
  isUsablePublicKey,
  pushDeviceId,
  serializePushSubscription,
  urlBase64ToUint8Array,
  type PushSupport,
} from "@/lib/web-push-client";
import {
  listMyDevices,
  registerMyPushDevice,
  setMyPushNotifications,
  unregisterMyDevice,
} from "@/services/notifications";

export type PushState = "off" | "on" | "blocked" | "needs_home_screen" | "unsupported";
export type PushEnableResult = "on" | "blocked" | "failed";

const publicKey = () => import.meta.env.VITE_WEB_PUSH_PUBLIC_KEY as string | undefined;

export function pushKeyConfigured(): boolean {
  return isUsablePublicKey(publicKey());
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration("/sw.js");
  return registration ? registration.pushManager.getSubscription() : null;
}

/** What this device looks like right now. Never asks for permission. */
export async function readPushState(): Promise<PushState> {
  const support: PushSupport = currentPushSupport();
  if (support !== "supported") return support;
  if (Notification.permission === "denied") return "blocked";
  if (Notification.permission !== "granted") return "off";
  try {
    return (await currentSubscription()) ? "on" : "off";
  } catch {
    return "off";
  }
}

/** Call only from a tap: this is where the browser's permission prompt appears. */
export async function enablePush(locale: "fr" | "ar"): Promise<PushEnableResult> {
  const key = publicKey();
  if (!isUsablePublicKey(key)) return "failed";
  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return "blocked";
    const registration = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
    const subscription =
      (await registration.pushManager.getSubscription()) ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
      }));
    const destination = serializePushSubscription(subscription.toJSON());
    if (!destination) {
      await subscription.unsubscribe();
      return "failed";
    }
    await registerMyPushDevice({
      deviceId: pushDeviceId(),
      platform: "web",
      pushProvider: "web_push",
      destination,
      locale,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Africa/Casablanca",
    });
    await setMyPushNotifications(true);
    return "on";
  } catch {
    return "failed";
  }
}

/** Forgets this browser: stops the browser subscription and removes the saved address. */
export async function disablePush(): Promise<boolean> {
  try {
    const subscription = await currentSubscription();
    if (subscription) await subscription.unsubscribe();
    const id = pushDeviceId();
    const device = (await listMyDevices()).find((d) => d.deviceId === id);
    if (device) await unregisterMyDevice(device.id);
    return true;
  } catch {
    return false;
  }
}
