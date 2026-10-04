import type { PushNotificationsPlugin } from "@capacitor/push-notifications";

import { isMfaStepUpError } from "@/backend/auth/step-up";
import type { RepositoryContext } from "@/backend/contracts/repository";
import type {
  NotificationDeviceRegistrationInput,
  NotificationDeviceRepository,
} from "@/backend/notifications/contracts";
import { NotificationError } from "@/backend/notifications/errors";
import type { NativePlatform } from "@/lib/native-app";
import { ANDROID_CHANNEL_FANTASY, ANDROID_CHANNEL_MATCH } from "@/lib/push-channels";

/**
 * Push alerts on the phone: asking permission, getting this phone's address
 * from Apple or Google, telling the server about it, and letting go of it.
 *
 * Everything here takes its plugin, repository and clock as arguments, so the
 * rules are tested without a phone; `native-push-runtime.ts` supplies the real
 * ones. The sending side's rules are in docs/backend/PUSH_NOTIFICATIONS.md.
 *
 * Two things this never does:
 *  - ask for permission anywhere but `enablePush`, which runs when the reader
 *    turns Push on (never at launch, never on a screen that did not ask);
 *  - let a failure here stop a sign-out (`forgetThisPhone` swallows everything).
 */

export type PushPlugin = Pick<
  PushNotificationsPlugin,
  "checkPermissions" | "requestPermissions" | "register" | "unregister" | "addListener"
>;

/** What the phone says about its permission, with the two "ask me" states as one. */
export type PushPermission = "granted" | "denied" | "prompt";

export function normalizePermission(state: string): PushPermission {
  if (state === "granted") return "granted";
  if (state === "denied") return "denied";
  return "prompt";
}

export interface PhoneIdentity {
  readonly platform: NativePlatform;
  readonly deviceId: string;
  readonly appVersion: string | null;
  readonly locale: "fr" | "ar";
  readonly timezone: string;
}

export interface PushDeps {
  readonly plugin: PushPlugin;
  readonly identity: PhoneIdentity;
  readonly devices: NotificationDeviceRepository;
  readonly context: () => RepositoryContext;
  /** How long to wait for Apple or Google to hand out an address. */
  readonly tokenTimeoutMs?: number;
}

/** The sender's provider for each phone: Apple directly, Google for Android. */
export function pushProviderFor(platform: NativePlatform): "apns" | "fcm" {
  return platform === "ios" ? "apns" : "fcm";
}

/**
 * Whether `token` looks like an address the sender can use, so a plugin answer
 * that is not one is never sent to the server. The sender holds the same rule
 * for Apple (hexadecimal); Google's are long runs of letters, digits and `_-:.`.
 */
export function isPlausibleToken(platform: NativePlatform, token: string): boolean {
  return platform === "ios"
    ? /^[0-9a-fA-F]{32,200}$/.test(token)
    : /^[A-Za-z0-9_:.-]{50,4096}$/.test(token);
}

export function registrationInput(
  identity: PhoneIdentity,
  token: string,
): NotificationDeviceRegistrationInput {
  return {
    deviceId: identity.deviceId,
    platform: identity.platform,
    pushProvider: pushProviderFor(identity.platform),
    destination: token,
    locale: identity.locale,
    timezone: identity.timezone,
    appVersion: identity.appVersion,
  };
}

type TokenResult = { readonly ok: true; readonly token: string } | { readonly ok: false };

/**
 * Asks the phone for this app's address and waits for the answer. Never
 * prompts: the permission is the caller's business. The listeners are always
 * removed, however it ends.
 */
export async function waitForToken(plugin: PushPlugin, timeoutMs: number): Promise<TokenResult> {
  const handles: Array<{ remove(): Promise<void> }> = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    let settle: (result: TokenResult) => void = () => undefined;
    const answer = new Promise<TokenResult>((resolve) => {
      settle = resolve;
    });
    // Both listeners are in place before registering, so the answer cannot be missed.
    handles.push(
      await plugin.addListener("registration", (token) => settle({ ok: true, token: token.value })),
    );
    handles.push(await plugin.addListener("registrationError", () => settle({ ok: false })));
    timer = setTimeout(() => settle({ ok: false }), timeoutMs);
    await plugin.register();
    return await answer;
  } catch {
    return { ok: false };
  } finally {
    if (timer) clearTimeout(timer);
    await Promise.allSettled(handles.map((handle) => handle.remove()));
  }
}

export type EnableOutcome =
  | { readonly ok: true; readonly registrationId: string }
  | {
      readonly ok: false;
      /**
       * denied: the reader (or the phone's settings) said no.
       * unavailable: the phone gave no usable address (no network, or Google's
       *   or Apple's setup in the app is missing).
       * conflict: this phone's address is held by another account.
       * mfa: the account owes its second-factor code first.
       */
      readonly reason: "denied" | "unavailable" | "conflict" | "mfa" | "error";
    };

export function classifyRegistrationError(error: unknown): "conflict" | "mfa" | "error" {
  if (isMfaStepUpError(error)) return "mfa";
  if (error instanceof NotificationError && error.code === "device_token_conflict")
    return "conflict";
  return "error";
}

/** Gets this phone's address and tells the server. No permission prompt. */
export async function registerThisPhone(deps: PushDeps): Promise<EnableOutcome> {
  const got = await waitForToken(deps.plugin, deps.tokenTimeoutMs ?? 15_000);
  if (!got.ok || !isPlausibleToken(deps.identity.platform, got.token))
    return { ok: false, reason: "unavailable" };
  try {
    const saved = await deps.devices.register(
      registrationInput(deps.identity, got.token),
      deps.context(),
    );
    return { ok: true, registrationId: saved.id };
  } catch (error) {
    return { ok: false, reason: classifyRegistrationError(error) };
  }
}

/**
 * The reader turned Push on: ask for permission if it has not been decided,
 * then register this phone. A permission already refused is not asked again
 * (the phone would not show it): the caller says where to change it.
 */
export async function enablePush(deps: PushDeps): Promise<EnableOutcome> {
  let permission = normalizePermission((await deps.plugin.checkPermissions()).receive);
  if (permission === "prompt")
    permission = normalizePermission((await deps.plugin.requestPermissions()).receive);
  if (permission !== "granted") return { ok: false, reason: "denied" };
  return registerThisPhone(deps);
}

/**
 * Keeps an enabled phone registered: the address can change (a reinstall, a
 * restore, Google refreshing it), and the server forgets a phone it could not
 * reach. Does nothing, and never prompts, unless permission is already granted.
 */
export async function refreshRegistration(deps: PushDeps): Promise<EnableOutcome> {
  const permission = normalizePermission((await deps.plugin.checkPermissions()).receive);
  if (permission !== "granted") return { ok: false, reason: "denied" };
  return registerThisPhone(deps);
}

async function thisPhonesRegistrationId(deps: PushDeps): Promise<string | null> {
  const mine = (await deps.devices.list(deps.context())).find(
    (device) => device.deviceId === deps.identity.deviceId,
  );
  return mine?.id ?? null;
}

/** Push turned off: the server stops sending to this phone. */
export async function switchOffThisPhone(deps: PushDeps): Promise<boolean> {
  try {
    const id = await thisPhonesRegistrationId(deps);
    if (!id) return false;
    await deps.devices.disable(id, deps.context());
    return true;
  } catch {
    return false;
  }
}

/**
 * Signing out: this phone's registration is deleted so the next account on it
 * can register the same address, and the phone drops its address. Best effort
 * and bounded in time, because it must never hold a sign-out back.
 */
export async function forgetThisPhone(deps: PushDeps, timeoutMs = 4_000): Promise<void> {
  const work = (async () => {
    const id = await thisPhonesRegistrationId(deps);
    if (id) await deps.devices.unregister(id, deps.context());
    await deps.plugin.unregister();
  })().catch(() => undefined);
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    work,
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, timeoutMs);
    }),
  ]);
  if (timer) clearTimeout(timer);
}

/**
 * Android only: makes the two channels the sender names, as high-importance
 * ones, so a goal appears on screen. Safe to repeat (an existing channel keeps
 * the reader's own settings and only has its name refreshed). Never throws.
 */
export async function ensureAndroidChannels(
  plugin: Pick<PushNotificationsPlugin, "createChannel">,
  labels: { readonly match: string; readonly fantasy: string },
): Promise<void> {
  const channel = (id: string, name: string) => ({
    id,
    name,
    importance: 4 as const,
    visibility: 1 as const,
    vibration: true,
    lights: true,
  });
  await Promise.allSettled([
    plugin.createChannel(channel(ANDROID_CHANNEL_MATCH, labels.match)),
    plugin.createChannel(channel(ANDROID_CHANNEL_FANTASY, labels.fantasy)),
  ]);
}
