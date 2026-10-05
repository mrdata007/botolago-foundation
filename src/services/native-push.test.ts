import { describe, expect, test } from "bun:test";

import type { RepositoryContext } from "@/backend/contracts/repository";
import type {
  NotificationDeviceRegistrationInput,
  NotificationDeviceRepository,
  NotificationDeviceSummaryDto,
} from "@/backend/notifications/contracts";
import { NotificationError } from "@/backend/notifications/errors";

import {
  classifyRegistrationError,
  enablePush,
  ensureAndroidChannels,
  forgetThisPhone,
  isPlausibleToken,
  normalizePermission,
  pushProviderFor,
  refreshRegistration,
  registerThisPhone,
  registrationInput,
  switchOffThisPhone,
  waitForToken,
  type PhoneIdentity,
  type PushDeps,
  type PushPlugin,
} from "./native-push";

const FCM_TOKEN = `${"a".repeat(22)}:APA91b${"X".repeat(130)}`;
const APNS_TOKEN = "AB".repeat(32);

const ANDROID: PhoneIdentity = {
  platform: "android",
  deviceId: "bg-11111111-1111-4111-8111-111111111111",
  appVersion: "1.0.0",
  locale: "fr",
  timezone: "Africa/Casablanca",
};
const IPHONE: PhoneIdentity = { ...ANDROID, platform: "ios", locale: "ar" };

/** A phone's push plugin: what it says about permission, and what it does on register(). */
function fakePlugin(options: {
  permission?: string;
  afterPrompt?: string;
  onRegister?: "token" | "error" | "silence" | "throw";
  token?: string;
}) {
  const calls: string[] = [];
  const listeners = new Map<string, (payload: never) => void>();
  const removed: string[] = [];
  let permission = options.permission ?? "granted";
  const plugin = {
    async checkPermissions() {
      calls.push("check");
      return { receive: permission };
    },
    async requestPermissions() {
      calls.push("request");
      permission = options.afterPrompt ?? "granted";
      return { receive: permission };
    },
    async register() {
      calls.push("register");
      const mode = options.onRegister ?? "token";
      if (mode === "throw") throw new Error("no firebase");
      if (mode === "token")
        queueMicrotask(() =>
          (listeners.get("registration") as ((payload: { value: string }) => void) | undefined)?.({
            value: options.token ?? FCM_TOKEN,
          }),
        );
      if (mode === "error")
        queueMicrotask(() =>
          (listeners.get("registrationError") as ((p: { error: string }) => void) | undefined)?.({
            error: "boom",
          }),
        );
    },
    async unregister() {
      calls.push("unregister");
    },
    async addListener(event: string, listener: (payload: never) => void) {
      listeners.set(event, listener);
      return {
        remove: async () => {
          removed.push(event);
          listeners.delete(event);
        },
      };
    },
  } as unknown as PushPlugin;
  return { plugin, calls, removed, listeners };
}

function fakeDevices(
  options: { registerError?: unknown; existing?: NotificationDeviceSummaryDto[] } = {},
) {
  const registered: NotificationDeviceRegistrationInput[] = [];
  const disabled: string[] = [];
  const unregistered: string[] = [];
  const repository: NotificationDeviceRepository = {
    async register(input) {
      if (options.registerError) throw options.registerError;
      registered.push(input);
      return {
        id: "22222222-2222-4222-8222-222222222222",
        deviceId: input.deviceId,
        platform: input.platform,
        pushProvider: input.pushProvider,
        locale: input.locale,
        timezone: input.timezone,
        enabled: true,
      };
    },
    async list() {
      return options.existing ?? [];
    },
    async disable(id) {
      disabled.push(id);
    },
    async unregister(id) {
      unregistered.push(id);
    },
  };
  return { repository, registered, disabled, unregistered };
}

const context = (): RepositoryContext => ({
  actorId: "11111111-1111-4111-8111-111111111111",
  requestId: "t",
});

function deps(
  plugin: PushPlugin,
  devices: NotificationDeviceRepository,
  identity: PhoneIdentity = ANDROID,
): PushDeps {
  return { plugin, devices, identity, context, tokenTimeoutMs: 50 };
}

const MINE: NotificationDeviceSummaryDto = {
  id: "33333333-3333-4333-8333-333333333333",
  deviceId: ANDROID.deviceId,
  platform: "android",
  pushProvider: "fcm",
  locale: "fr",
  timezone: "Africa/Casablanca",
  enabled: true,
};

describe("what the phone and server need to agree on", () => {
  test("Apple directly for iPhone, Google for Android", () => {
    expect(pushProviderFor("ios")).toBe("apns");
    expect(pushProviderFor("android")).toBe("fcm");
  });

  test("the registration carries this phone's identity and the right provider", () => {
    expect(registrationInput(IPHONE, APNS_TOKEN)).toEqual({
      deviceId: IPHONE.deviceId,
      platform: "ios",
      pushProvider: "apns",
      destination: APNS_TOKEN,
      locale: "ar",
      timezone: "Africa/Casablanca",
      appVersion: "1.0.0",
    });
    expect(registrationInput(ANDROID, FCM_TOKEN).pushProvider).toBe("fcm");
  });

  test("only addresses the sender could use are accepted", () => {
    expect(isPlausibleToken("ios", APNS_TOKEN)).toBe(true);
    expect(isPlausibleToken("ios", "not hex!")).toBe(false);
    expect(isPlausibleToken("ios", "AB".repeat(8))).toBe(false);
    expect(isPlausibleToken("android", FCM_TOKEN)).toBe(true);
    expect(isPlausibleToken("android", "short")).toBe(false);
    expect(isPlausibleToken("android", `${FCM_TOKEN} with spaces`)).toBe(false);
  });

  test("the permission states the phone reports are three", () => {
    expect(normalizePermission("granted")).toBe("granted");
    expect(normalizePermission("denied")).toBe("denied");
    expect(normalizePermission("prompt")).toBe("prompt");
    expect(normalizePermission("prompt-with-rationale")).toBe("prompt");
  });
});

describe("waiting for the phone's address", () => {
  test("returns the address, and removes both listeners", async () => {
    const phone = fakePlugin({});
    expect(await waitForToken(phone.plugin, 50)).toEqual({ ok: true, token: FCM_TOKEN });
    expect(phone.removed.sort()).toEqual(["registration", "registrationError"]);
  });

  test("a registration error, silence and a throwing register() all end in failure, cleaned up", async () => {
    for (const onRegister of ["error", "silence", "throw"] as const) {
      const phone = fakePlugin({ onRegister });
      expect(await waitForToken(phone.plugin, 20)).toEqual({ ok: false });
      expect(phone.removed.sort()).toEqual(["registration", "registrationError"]);
    }
  });
});

describe("turning Push on", () => {
  test("asks once when undecided, then registers this phone", async () => {
    const phone = fakePlugin({ permission: "prompt" });
    const server = fakeDevices();
    const outcome = await enablePush(deps(phone.plugin, server.repository));
    expect(outcome).toEqual({ ok: true, registrationId: "22222222-2222-4222-8222-222222222222" });
    expect(phone.calls).toEqual(["check", "request", "register"]);
    expect(server.registered).toEqual([registrationInput(ANDROID, FCM_TOKEN)]);
  });

  test("does not ask again when already granted", async () => {
    const phone = fakePlugin({ permission: "granted" });
    await enablePush(deps(phone.plugin, fakeDevices().repository));
    expect(phone.calls).toEqual(["check", "register"]);
  });

  test("a refusal stops there: no address is requested and nothing is sent to the server", async () => {
    const refusedNow = fakePlugin({ permission: "prompt", afterPrompt: "denied" });
    const server = fakeDevices();
    expect(await enablePush(deps(refusedNow.plugin, server.repository))).toEqual({
      ok: false,
      reason: "denied",
    });
    expect(refusedNow.calls).toEqual(["check", "request"]);

    const refusedBefore = fakePlugin({ permission: "denied" });
    expect(await enablePush(deps(refusedBefore.plugin, server.repository))).toEqual({
      ok: false,
      reason: "denied",
    });
    expect(refusedBefore.calls).toEqual(["check"]);
    expect(server.registered).toEqual([]);
  });

  test("an address the phone cannot give, or a junk one, is 'unavailable' and is not sent", async () => {
    const server = fakeDevices();
    expect(
      await enablePush(deps(fakePlugin({ onRegister: "error" }).plugin, server.repository)),
    ).toEqual({ ok: false, reason: "unavailable" });
    expect(await enablePush(deps(fakePlugin({ token: "junk" }).plugin, server.repository))).toEqual(
      { ok: false, reason: "unavailable" },
    );
    expect(server.registered).toEqual([]);
  });

  test("an iPhone registers its Apple address", async () => {
    const server = fakeDevices();
    const outcome = await enablePush(
      deps(fakePlugin({ token: APNS_TOKEN }).plugin, server.repository, IPHONE),
    );
    expect(outcome.ok).toBe(true);
    expect(server.registered[0]).toMatchObject({ platform: "ios", pushProvider: "apns" });
  });

  test("the server's refusals are told apart: another account holds the address, a code is owed", async () => {
    const conflict = fakeDevices({
      registerError: new NotificationError("device_token_conflict", "taken"),
    });
    expect(await registerThisPhone(deps(fakePlugin({}).plugin, conflict.repository))).toEqual({
      ok: false,
      reason: "conflict",
    });
    const mfa = fakeDevices({ registerError: { code: "PT403", message: "mfa_required" } });
    expect(await registerThisPhone(deps(fakePlugin({}).plugin, mfa.repository))).toEqual({
      ok: false,
      reason: "mfa",
    });
    const other = fakeDevices({ registerError: new Error("down") });
    expect(await registerThisPhone(deps(fakePlugin({}).plugin, other.repository))).toEqual({
      ok: false,
      reason: "error",
    });
    expect(classifyRegistrationError(new NotificationError("invalid_device", "x"))).toBe("error");
  });
});

describe("keeping a phone registered", () => {
  test("registers again when permission is granted, without ever asking", async () => {
    const phone = fakePlugin({ permission: "granted" });
    const server = fakeDevices();
    expect((await refreshRegistration(deps(phone.plugin, server.repository))).ok).toBe(true);
    expect(phone.calls).toEqual(["check", "register"]);
    expect(server.registered).toHaveLength(1);
  });

  test("does nothing, and does not prompt, when permission is not granted", async () => {
    for (const permission of ["prompt", "denied"]) {
      const phone = fakePlugin({ permission });
      const server = fakeDevices();
      expect(await refreshRegistration(deps(phone.plugin, server.repository))).toEqual({
        ok: false,
        reason: "denied",
      });
      expect(phone.calls).toEqual(["check"]);
      expect(server.registered).toEqual([]);
    }
  });
});

describe("turning Push off and signing out", () => {
  test("switching off disables this phone's registration only", async () => {
    const other = {
      ...MINE,
      id: "44444444-4444-4444-8444-444444444444",
      deviceId: "bg-other-phone-0001",
    };
    const server = fakeDevices({ existing: [other, MINE] });
    expect(await switchOffThisPhone(deps(fakePlugin({}).plugin, server.repository))).toBe(true);
    expect(server.disabled).toEqual([MINE.id]);
  });

  test("switching off with no registration, or a failing server, is quiet", async () => {
    expect(await switchOffThisPhone(deps(fakePlugin({}).plugin, fakeDevices().repository))).toBe(
      false,
    );
    const broken = fakeDevices();
    broken.repository.list = async () => {
      throw new Error("down");
    };
    expect(await switchOffThisPhone(deps(fakePlugin({}).plugin, broken.repository))).toBe(false);
  });

  test("signing out deletes this phone's registration and drops its address", async () => {
    const phone = fakePlugin({});
    const server = fakeDevices({ existing: [MINE] });
    await forgetThisPhone(deps(phone.plugin, server.repository));
    expect(server.unregistered).toEqual([MINE.id]);
    expect(phone.calls).toEqual(["unregister"]);
  });

  test("signing out is never held back: a failing server, or one that never answers", async () => {
    const failing = fakeDevices();
    failing.repository.list = async () => {
      throw new Error("down");
    };
    await forgetThisPhone(deps(fakePlugin({}).plugin, failing.repository));

    const hanging = fakeDevices();
    hanging.repository.list = () => new Promise(() => undefined);
    const started = Date.now();
    await forgetThisPhone(deps(fakePlugin({}).plugin, hanging.repository), 30);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  test("the phone drops its address even when the server half fails", async () => {
    // Listing fails (for instance a session no longer at the second factor).
    const listFails = fakePlugin({});
    const down = fakeDevices({ existing: [MINE] });
    down.repository.list = async () => {
      throw new Error("aal2_required");
    };
    await forgetThisPhone(deps(listFails.plugin, down.repository));
    expect(listFails.calls).toEqual(["unregister"]);

    // The registration is found but deleting it fails.
    const deleteFails = fakePlugin({});
    const refused = fakeDevices({ existing: [MINE] });
    refused.repository.unregister = async () => {
      throw new Error("timeout");
    };
    await forgetThisPhone(deps(deleteFails.plugin, refused.repository));
    expect(deleteFails.calls).toEqual(["unregister"]);

    // The server never answers: the phone has still dropped its address by the
    // time the sign-out is let go.
    const neverAnswers = fakePlugin({});
    const hanging = fakeDevices({ existing: [MINE] });
    hanging.repository.list = () => new Promise(() => undefined);
    await forgetThisPhone(deps(neverAnswers.plugin, hanging.repository), 30);
    expect(neverAnswers.calls).toEqual(["unregister"]);
  });

  test("the server half still runs when the phone's own unregister fails", async () => {
    const phone = fakePlugin({});
    phone.plugin.unregister = async () => {
      throw new Error("native bridge gone");
    };
    const server = fakeDevices({ existing: [MINE] });
    await forgetThisPhone(deps(phone.plugin, server.repository));
    expect(server.unregistered).toEqual([MINE.id]);
  });
});

describe("Android channels", () => {
  test("makes the two channels the sender names, high importance, with the reader's language", async () => {
    const made: Array<Record<string, unknown>> = [];
    await ensureAndroidChannels(
      {
        createChannel: async (channel: Record<string, unknown>) => {
          made.push(channel);
        },
      } as never,
      { match: "Alertes match", fantasy: "Rappels Fantasy" },
    );
    expect(made.map((channel) => [channel.id, channel.name, channel.importance])).toEqual([
      ["match_alerts", "Alertes match", 4],
      ["fantasy_reminders", "Rappels Fantasy", 4],
    ]);
  });

  test("a phone that refuses a channel does not stop the other, or throw", async () => {
    const made: string[] = [];
    await ensureAndroidChannels(
      {
        createChannel: async (channel: { id: string }) => {
          if (channel.id === "match_alerts") throw new Error("no");
          made.push(channel.id);
        },
      } as never,
      { match: "a", fantasy: "b" },
    );
    expect(made).toEqual(["fantasy_reminders"]);
  });
});
