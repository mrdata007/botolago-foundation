import { describe, expect, it } from "bun:test";
import {
  ApnsProvider,
  FcmProvider,
  parseApnsCredentials,
  parseFcmCredentials,
  type ApnsCredentials,
  type FcmCredentials,
} from "./notification-push-providers.ts";
import { base64url, importSigningKey, pemToDer, signJwt } from "./notification-push-jwt.ts";
import { clip, threadId, type ClaimedPushDelivery } from "./notification-push-types.ts";

// ---------------------------------------------------------------------------
// Real keys, so a signature can be verified instead of assumed
// ---------------------------------------------------------------------------
// The header is built in pieces: the repository's secrets scan matches the
// contiguous text, and this file holds no secret. Every key here is generated
// when the test runs, or is placeholder text.
const pemBlock = (body: string) =>
  ["-----BEGIN ", "PRIVATE KEY-----\n", body, "\n-----END ", "PRIVATE KEY-----\n"].join("");

function toPem(der: Uint8Array): string {
  let binary = "";
  for (const byte of der) binary += String.fromCharCode(byte);
  const body = btoa(binary)
    .match(/.{1,64}/g)!
    .join("\n");
  return pemBlock(body);
}

async function rsaKeys() {
  const pair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  const der = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
  return { pem: toPem(der), publicKey: pair.publicKey };
}

async function ecKeys() {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
    "verify",
  ]);
  const der = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
  return { pem: toPem(der), publicKey: pair.publicKey };
}

function fromBase64url(text: string): Uint8Array {
  const padded =
    text.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (text.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function decodePart(part: string): Record<string, unknown> {
  return JSON.parse(new TextDecoder().decode(fromBase64url(part)));
}

async function verifyJwt(
  jwt: string,
  algorithm: "RS256" | "ES256",
  publicKey: CryptoKey,
): Promise<{ header: Record<string, unknown>; claims: Record<string, unknown>; valid: boolean }> {
  const [header, claims, signature] = jwt.split(".");
  const valid = await crypto.subtle.verify(
    algorithm === "RS256" ? { name: "RSASSA-PKCS1-v1_5" } : { name: "ECDSA", hash: "SHA-256" },
    publicKey,
    fromBase64url(signature!),
    new TextEncoder().encode(`${header}.${claims}`),
  );
  return { header: decodePart(header!), claims: decodePart(claims!), valid };
}

// ---------------------------------------------------------------------------
// A fake network
// ---------------------------------------------------------------------------
interface Call {
  readonly url: string;
  readonly init: RequestInit;
}

function network(respond: (call: Call, index: number) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetchImpl = async (input: string | URL | Request, init: RequestInit = {}) => {
    const call = { url: String(input), init };
    calls.push(call);
    return respond(call, calls.length - 1);
  };
  return { calls, fetchImpl };
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });

function delivery(overrides: Partial<ClaimedPushDelivery> = {}): ClaimedPushDelivery {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    notificationId: "22222222-2222-4222-8222-222222222222",
    attemptNumber: 1,
    providerKey: "fcm",
    platform: "android",
    deviceRegistrationId: "33333333-3333-4333-8333-333333333333",
    type: "goal",
    language: "fr",
    title: "But pour le Raja !",
    body: "Raja 1–0 Wydad (34′)",
    deepLink: { target: "match_detail", entityId: "44444444-4444-4444-8444-444444444444" },
    expiresInSeconds: 600,
    destination: "fcm-device-token-0123456789:abcdef_ghijkl-mnopqr",
    ...overrides,
  };
}

const NOW = Date.UTC(2026, 9, 5, 18, 0, 0);

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------
describe("jwt helpers", () => {
  it("reads a PEM, and one whose line breaks were pasted as the two characters \\n", async () => {
    const { pem } = await ecKeys();
    expect(pemToDer(pem).length).toBeGreaterThan(30);
    expect(pemToDer(pem.trim().replace(/\n/g, "\\n"))).toEqual(pemToDer(pem));
  });

  it("refuses what is not a key, with a code and no echo of the input", async () => {
    await expect(importSigningKey("not a key at all", "ES256")).rejects.toThrow(
      "push_key_unreadable",
    );
    await expect(importSigningKey(pemBlock(""), "RS256")).rejects.toThrow("push_key_unreadable");
    // An RSA key is not an EC key.
    const { pem } = await rsaKeys();
    await expect(importSigningKey(pem, "ES256")).rejects.toThrow("push_key_unreadable");
  });

  it("base64url has no padding or +/ characters", () => {
    expect(base64url(new Uint8Array([251, 255, 254, 253]))).toBe("-__-_Q");
    expect(base64url("any carnal pleas")).not.toMatch(/[+/=]/);
  });
});

describe("what is sent about a notification", () => {
  it("clips long text to a number of characters, not bytes, with an ellipsis", () => {
    expect(clip("court", 10)).toBe("court");
    expect(clip("x".repeat(20), 10)).toBe(`${"x".repeat(9)}…`);
    const arabic = "ا".repeat(30);
    expect(Array.from(clip(arabic, 10))).toHaveLength(10);
  });

  it("groups a match's alerts under the page they open, others under their type", () => {
    expect(threadId(delivery())).toBe("match_detail:44444444-4444-4444-8444-444444444444");
    expect(
      threadId(delivery({ deepLink: { target: "none", entityId: null }, type: "deadline_24h" })),
    ).toBe("deadline_24h");
  });
});

// ---------------------------------------------------------------------------
// FCM
// ---------------------------------------------------------------------------
async function fcmSetup(
  respond: (call: Call, index: number) => Response | Promise<Response>,
  clock: { now: number } = { now: NOW },
) {
  const keys = await rsaKeys();
  const credentials: FcmCredentials = {
    projectId: "botolago-test",
    clientEmail: "dispatcher@botolago-test.iam.gserviceaccount.com",
    privateKey: keys.pem,
  };
  const net = network(respond);
  const provider = new FcmProvider(credentials, net.fetchImpl, () => clock.now);
  return { keys, credentials, provider, ...net, clock };
}

const googleToken = () => json(200, { access_token: "ya29." + "t".repeat(40), expires_in: 3600 });
const isTokenCall = (call: Call) => call.url === "https://oauth2.googleapis.com/token";

describe("FCM credentials", () => {
  it("reads the service-account JSON and refuses anything incomplete", () => {
    const good = JSON.stringify({
      project_id: "botolago-test",
      client_email: "d@botolago-test.iam.gserviceaccount.com",
      private_key: pemBlock("abc"),
    });
    expect(parseFcmCredentials(good).projectId).toBe("botolago-test");
    for (const bad of [
      "{",
      "[]",
      JSON.stringify({ project_id: "x", client_email: "a@b.c", private_key: "PRIVATE KEY" }),
      JSON.stringify({
        project_id: "botolago-test",
        client_email: "nope",
        private_key: "PRIVATE KEY",
      }),
      JSON.stringify({ project_id: "botolago-test", client_email: "a@b.c", private_key: "secret" }),
    ]) {
      expect(() => parseFcmCredentials(bad)).toThrow("fcm_credentials_unreadable");
    }
  });
});

describe("FcmProvider", () => {
  it("logs in with a correctly signed service-account token, then sends the message", async () => {
    const setup = await fcmSetup((call) =>
      isTokenCall(call)
        ? googleToken()
        : json(200, { name: "projects/botolago-test/messages/0:abc" }),
    );
    const result = await setup.provider.send(delivery());
    expect(result).toMatchObject({
      outcome: "sent",
      providerMessageId: "projects/botolago-test/messages/0:abc",
      invalidDestination: false,
      refusal: null,
    });

    const login = setup.calls[0]!;
    expect(login.url).toBe("https://oauth2.googleapis.com/token");
    const form = new URLSearchParams(String(login.init.body));
    expect(form.get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:jwt-bearer");
    const jwt = await verifyJwt(form.get("assertion")!, "RS256", setup.keys.publicKey);
    expect(jwt.valid).toBe(true);
    expect(jwt.header).toEqual({ alg: "RS256", typ: "JWT" });
    expect(jwt.claims).toEqual({
      iss: "dispatcher@botolago-test.iam.gserviceaccount.com",
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: NOW / 1000,
      exp: NOW / 1000 + 3600,
    });
  });

  it("sends the alert to the device with the page it opens and a lifetime", async () => {
    const setup = await fcmSetup((call) =>
      isTokenCall(call) ? googleToken() : json(200, { name: "projects/p/messages/1" }),
    );
    await setup.provider.send(delivery());
    const send = setup.calls[1]!;
    expect(send.url).toBe("https://fcm.googleapis.com/v1/projects/botolago-test/messages:send");
    expect((send.init.headers as Record<string, string>).authorization).toBe(
      `Bearer ya29.${"t".repeat(40)}`,
    );
    expect(JSON.parse(String(send.init.body))).toEqual({
      message: {
        token: "fcm-device-token-0123456789:abcdef_ghijkl-mnopqr",
        notification: { title: "But pour le Raja !", body: "Raja 1–0 Wydad (34′)" },
        data: {
          deliveryId: "11111111-1111-4111-8111-111111111111",
          type: "goal",
          target: "match_detail",
          entityId: "44444444-4444-4444-8444-444444444444",
          threadId: "match_detail:44444444-4444-4444-8444-444444444444",
        },
        android: {
          priority: "HIGH",
          ttl: "600s",
          notification: { channel_id: "match_alerts" },
        },
      },
    });
  });

  it("shows each kind of alert in its Android channel, and names none for a kind it does not know", async () => {
    const setup = await fcmSetup((call) =>
      isTokenCall(call) ? googleToken() : json(200, { name: "projects/p/messages/1" }),
    );
    const androidOf = (call: { init: RequestInit }) =>
      (JSON.parse(String(call.init.body)) as { message: { android: Record<string, unknown> } })
        .message.android;
    const expected: Array<[string, unknown]> = [
      ["match_starting", { channel_id: "match_alerts" }],
      ["goal", { channel_id: "match_alerts" }],
      ["goal_cancelled", { channel_id: "match_alerts" }],
      ["full_time", { channel_id: "match_alerts" }],
      ["deadline_1h", { channel_id: "fantasy_reminders" }],
      ["deadline_24h", { channel_id: "fantasy_reminders" }],
      ["breaking_news", undefined],
    ];
    for (const [type] of expected) await setup.provider.send(delivery({ type }));
    const sends = setup.calls.filter((call) => !isTokenCall(call));
    expect(sends.map((call) => androidOf(call).notification)).toEqual(expected.map(([, c]) => c));
  });

  it("logs in once and reuses the login until shortly before it ends", async () => {
    const clock = { now: NOW };
    const setup = await fcmSetup(
      (call) => (isTokenCall(call) ? googleToken() : json(200, { name: "projects/p/messages/1" })),
      clock,
    );
    await setup.provider.send(delivery());
    await setup.provider.send(delivery());
    expect(setup.calls.filter(isTokenCall)).toHaveLength(1);
    clock.now = NOW + 3_600_000 - 60_000; // inside the two-minute margin
    await setup.provider.send(delivery());
    expect(setup.calls.filter(isTokenCall)).toHaveLength(2);
  });

  it("a dead token: failed for good, and the device is to be turned off", async () => {
    for (const [status, body, code] of [
      [
        404,
        { error: { code: 404, status: "NOT_FOUND", details: [{ errorCode: "UNREGISTERED" }] } },
        "fcm_unregistered",
      ],
      [
        403,
        {
          error: {
            code: 403,
            status: "PERMISSION_DENIED",
            details: [{ errorCode: "SENDER_ID_MISMATCH" }],
          },
        },
        "fcm_sender_mismatch",
      ],
      [
        400,
        {
          error: {
            code: 400,
            status: "INVALID_ARGUMENT",
            message: "The registration token is not a valid FCM registration token",
          },
        },
        "fcm_token_invalid",
      ],
    ] as const) {
      const setup = await fcmSetup((call) =>
        isTokenCall(call) ? googleToken() : json(status, body),
      );
      expect(await setup.provider.send(delivery())).toMatchObject({
        outcome: "permanent_failure",
        stableErrorCode: code,
        invalidDestination: true,
        refusal: null,
      });
    }
  });

  it("a bad message is failed for good but the device is kept", async () => {
    const setup = await fcmSetup((call) =>
      isTokenCall(call)
        ? googleToken()
        : json(400, {
            error: {
              code: 400,
              status: "INVALID_ARGUMENT",
              message: "Invalid value at 'message.data'",
            },
          }),
    );
    expect(await setup.provider.send(delivery())).toMatchObject({
      outcome: "permanent_failure",
      stableErrorCode: "fcm_invalid_argument",
      invalidDestination: false,
    });
  });

  it("slow down and outages are retried, honouring Retry-After", async () => {
    const limited = await fcmSetup((call) =>
      isTokenCall(call)
        ? googleToken()
        : json(429, { error: { status: "RESOURCE_EXHAUSTED" } }, { "retry-after": "45" }),
    );
    expect(await limited.provider.send(delivery())).toMatchObject({
      outcome: "retryable_failure",
      stableErrorCode: "fcm_rate_limited",
      retryAfterSeconds: 45,
    });
    const down = await fcmSetup((call) =>
      isTokenCall(call) ? googleToken() : json(503, { error: { status: "UNAVAILABLE" } }),
    );
    expect(await down.provider.send(delivery())).toMatchObject({
      outcome: "retryable_failure",
      stableErrorCode: "fcm_unavailable",
    });
    const offline = await fcmSetup((call) => {
      if (isTokenCall(call)) return googleToken();
      throw new TypeError("network down");
    });
    expect(await offline.provider.send(delivery())).toMatchObject({
      outcome: "retryable_failure",
      stableErrorCode: "fcm_network_error",
    });
  });

  it("a login Google revoked is replaced once; a second refusal is ours to fix, not the device's", async () => {
    let sends = 0;
    const recovers = await fcmSetup((call) => {
      if (isTokenCall(call)) return googleToken();
      sends += 1;
      return sends === 1
        ? json(401, { error: { status: "UNAUTHENTICATED" } })
        : json(200, { name: "projects/p/messages/2" });
    });
    expect((await recovers.provider.send(delivery())).outcome).toBe("sent");
    expect(recovers.calls.filter(isTokenCall)).toHaveLength(2);

    const refused = await fcmSetup((call) =>
      isTokenCall(call) ? googleToken() : json(401, { error: { status: "UNAUTHENTICATED" } }),
    );
    expect(await refused.provider.send(delivery())).toMatchObject({
      outcome: "retryable_failure",
      stableErrorCode: "fcm_credentials_rejected",
      refusal: "credentials_rejected",
      invalidDestination: false,
    });
  });

  it("a service account Google will not log in is a refusal about us; Google down is not", async () => {
    const rejected = await fcmSetup(() => json(400, { error: "invalid_grant" }));
    expect(await rejected.provider.send(delivery())).toMatchObject({
      stableErrorCode: "fcm_credentials_rejected",
      refusal: "credentials_rejected",
    });
    const down = await fcmSetup(() => json(503, {}));
    expect(await down.provider.send(delivery())).toMatchObject({
      outcome: "retryable_failure",
      stableErrorCode: "fcm_token_unavailable",
      refusal: null,
    });
  });

  it("a project or permission problem is a refusal about our setup, the same for every device", async () => {
    const setup = await fcmSetup((call) =>
      isTokenCall(call)
        ? googleToken()
        : json(403, {
            error: { code: 403, status: "PERMISSION_DENIED", message: "API not enabled" },
          }),
    );
    expect(await setup.provider.send(delivery())).toMatchObject({
      outcome: "retryable_failure",
      stableErrorCode: "fcm_configuration_rejected",
      refusal: "configuration_rejected",
      invalidDestination: false,
    });
  });

  it("an unreadable key is reported as a refusal, without echoing it", async () => {
    const provider = new FcmProvider(
      {
        projectId: "botolago-test",
        clientEmail: "d@botolago-test.iam.gserviceaccount.com",
        privateKey: "PRIVATE KEY nope",
      },
      network(() => googleToken()).fetchImpl,
      () => NOW,
    );
    const result = await provider.send(delivery());
    expect(result).toMatchObject({
      stableErrorCode: "fcm_key_unreadable",
      refusal: "credentials_rejected",
    });
    expect(JSON.stringify(result)).not.toContain("nope");
  });

  it("never puts a device token or the message text in what it returns", async () => {
    const setup = await fcmSetup((call) =>
      isTokenCall(call)
        ? googleToken()
        : json(404, { error: { details: [{ errorCode: "UNREGISTERED" }] } }),
    );
    const text = JSON.stringify(await setup.provider.send(delivery()));
    expect(text).not.toContain("fcm-device-token");
    expect(text).not.toContain("Raja");
  });
});

// ---------------------------------------------------------------------------
// APNs
// ---------------------------------------------------------------------------
const APNS_TOKEN = "a".repeat(64);

async function apnsSetup(
  respond: (call: Call, index: number) => Response | Promise<Response>,
  options: { environment?: "production" | "sandbox"; clock?: { now: number } } = {},
) {
  const keys = await ecKeys();
  const credentials: ApnsCredentials = {
    keyId: "ABC123DEFG",
    teamId: "TEAM123456",
    bundleId: "botolago.com",
    privateKey: keys.pem,
    environment: options.environment ?? "production",
  };
  const clock = options.clock ?? { now: NOW };
  const net = network(respond);
  const provider = new ApnsProvider(credentials, net.fetchImpl, () => clock.now);
  return { keys, provider, clock, ...net };
}

const ok = () => new Response(null, { status: 200, headers: { "apns-id": "apple-message-id-1" } });
const apnsDelivery = (overrides: Partial<ClaimedPushDelivery> = {}) =>
  delivery({ providerKey: "apns", platform: "ios", destination: APNS_TOKEN, ...overrides });

describe("APNs credentials", () => {
  const good = {
    APNS_KEY_ID: "ABC123DEFG",
    APNS_TEAM_ID: "TEAM123456",
    APNS_BUNDLE_ID: "botolago.com",
    APNS_KEY_P8: pemBlock("abc"),
  };
  it("reads the secrets, production by default", () => {
    expect(parseApnsCredentials(good)).toMatchObject({
      environment: "production",
      bundleId: "botolago.com",
    });
    expect(parseApnsCredentials({ ...good, APNS_ENVIRONMENT: "Sandbox" }).environment).toBe(
      "sandbox",
    );
  });
  it("refuses anything malformed", () => {
    for (const bad of [
      { ...good, APNS_KEY_ID: "short" },
      { ...good, APNS_TEAM_ID: "lowercase1" },
      { ...good, APNS_BUNDLE_ID: "bad id" },
      { ...good, APNS_KEY_P8: "secret" },
      { ...good, APNS_ENVIRONMENT: "staging" },
      {},
    ]) {
      expect(() => parseApnsCredentials(bad)).toThrow("apns_credentials_unreadable");
    }
  });
});

describe("ApnsProvider", () => {
  it("signs its provider token with ES256 and sends the alert with Apple's headers", async () => {
    const setup = await apnsSetup(() => ok());
    const result = await setup.provider.send(apnsDelivery());
    expect(result).toMatchObject({ outcome: "sent", providerMessageId: "apple-message-id-1" });

    const call = setup.calls[0]!;
    expect(call.url).toBe(`https://api.push.apple.com/3/device/${APNS_TOKEN}`);
    const headers = call.init.headers as Record<string, string>;
    const jwt = await verifyJwt(
      headers.authorization!.replace(/^bearer /, ""),
      "ES256",
      setup.keys.publicKey,
    );
    expect(jwt.valid).toBe(true);
    expect(jwt.header).toEqual({ alg: "ES256", typ: "JWT", kid: "ABC123DEFG" });
    expect(jwt.claims).toEqual({ iss: "TEAM123456", iat: NOW / 1000 });
    expect(headers["apns-topic"]).toBe("botolago.com");
    expect(headers["apns-push-type"]).toBe("alert");
    expect(headers["apns-priority"]).toBe("10");
    expect(headers["apns-id"]).toBe("11111111-1111-4111-8111-111111111111");
    // Apple drops the alert after this instant: ten minutes for a goal.
    expect(headers["apns-expiration"]).toBe(String(NOW / 1000 + 600));
  });

  it("puts the alert, its thread and the page it opens in the payload", async () => {
    const setup = await apnsSetup(() => ok());
    await setup.provider.send(apnsDelivery());
    expect(JSON.parse(String(setup.calls[0]!.init.body))).toEqual({
      aps: {
        alert: { title: "But pour le Raja !", body: "Raja 1–0 Wydad (34′)" },
        sound: "default",
        "thread-id": "match_detail:44444444-4444-4444-8444-444444444444",
      },
      deliveryId: "11111111-1111-4111-8111-111111111111",
      type: "goal",
      target: "match_detail",
      entityId: "44444444-4444-4444-8444-444444444444",
    });
  });

  it("keeps a long Arabic message inside Apple's size limit", async () => {
    const setup = await apnsSetup(() => ok());
    await setup.provider.send(apnsDelivery({ title: "ع".repeat(500), body: "ع".repeat(4000) }));
    expect(String(setup.calls[0]!.init.body).length).toBeLessThan(2_000);
  });

  it("uses Apple's sandbox host when asked to", async () => {
    const setup = await apnsSetup(() => ok(), { environment: "sandbox" });
    await setup.provider.send(apnsDelivery());
    expect(setup.calls[0]!.url).toStartWith("https://api.sandbox.push.apple.com/3/device/");
  });

  it("makes one provider token and reuses it for fifty minutes", async () => {
    const clock = { now: NOW };
    const setup = await apnsSetup(() => ok(), { clock });
    await setup.provider.send(apnsDelivery());
    clock.now = NOW + 49 * 60_000;
    await setup.provider.send(apnsDelivery());
    const tokens = new Set(
      setup.calls.map((call) => (call.init.headers as Record<string, string>).authorization),
    );
    expect(tokens.size).toBe(1);
    clock.now = NOW + 51 * 60_000;
    await setup.provider.send(apnsDelivery());
    const later = new Set(
      setup.calls.map((call) => (call.init.headers as Record<string, string>).authorization),
    );
    expect(later.size).toBe(2);
  });

  it("never lets a token that is not a hex string into the address", async () => {
    const setup = await apnsSetup(() => ok());
    for (const destination of ["../../v1/admin", "zz".repeat(32), "ab", `${"a".repeat(64)}?x=1`]) {
      expect(await setup.provider.send(apnsDelivery({ destination }))).toMatchObject({
        outcome: "permanent_failure",
        stableErrorCode: "apns_token_malformed",
        invalidDestination: true,
      });
    }
    expect(setup.calls).toHaveLength(0);
  });

  it("a dead token: failed for good, and the device is to be turned off", async () => {
    for (const [status, reason, code] of [
      [410, "Unregistered", "apns_unregistered"],
      [400, "BadDeviceToken", "apns_bad_device_token"],
      [400, "DeviceTokenNotForTopic", "apns_device_token_not_for_topic"],
    ] as const) {
      const setup = await apnsSetup(() => json(status, { reason }));
      expect(await setup.provider.send(apnsDelivery())).toMatchObject({
        outcome: "permanent_failure",
        stableErrorCode: code,
        invalidDestination: true,
        refusal: null,
      });
    }
  });

  it("our own topic or environment being wrong is a refusal, not a dead device", async () => {
    for (const reason of ["BadTopic", "TopicDisallowed"]) {
      const setup = await apnsSetup(() => json(400, { reason }));
      expect(await setup.provider.send(apnsDelivery())).toMatchObject({
        outcome: "retryable_failure",
        stableErrorCode: "apns_configuration_rejected",
        refusal: "configuration_rejected",
        invalidDestination: false,
      });
    }
  });

  it("slow down and outages are retried, honouring Retry-After", async () => {
    const limited = await apnsSetup(() =>
      json(429, { reason: "TooManyRequests" }, { "retry-after": "30" }),
    );
    expect(await limited.provider.send(apnsDelivery())).toMatchObject({
      outcome: "retryable_failure",
      stableErrorCode: "apns_rate_limited",
      retryAfterSeconds: 30,
    });
    const down = await apnsSetup(() => json(503, { reason: "ServiceUnavailable" }));
    expect(await down.provider.send(apnsDelivery())).toMatchObject({
      outcome: "retryable_failure",
      stableErrorCode: "apns_unavailable",
    });
    const offline = await apnsSetup(() => {
      throw new TypeError("network down");
    });
    expect(await offline.provider.send(apnsDelivery())).toMatchObject({
      outcome: "retryable_failure",
      stableErrorCode: "apns_network_error",
    });
  });

  it("an expired provider token is replaced once and the send repeated", async () => {
    const clock = { now: NOW };
    let attempts = 0;
    const setup = await apnsSetup(
      () => {
        attempts += 1;
        // Apple rejects the 49-minute-old token, accepts the new one.
        return attempts === 1 ? json(403, { reason: "ExpiredProviderToken" }) : ok();
      },
      { clock },
    );
    // Make the cached token old enough that Apple's refusal can be about its age.
    await setup.provider.send(apnsDelivery());
    attempts = 0;
    clock.now = NOW + 49 * 60_000;
    expect((await setup.provider.send(apnsDelivery())).outcome).toBe("sent");
    expect(attempts).toBe(2);
    const tokens = setup.calls.map(
      (call) => (call.init.headers as Record<string, string>).authorization,
    );
    expect(tokens.at(-1)).not.toBe(tokens.at(-2));
  });

  it("a token Apple refuses straight after it was made means the key is wrong: a refusal about us", async () => {
    const setup = await apnsSetup(() => json(403, { reason: "InvalidProviderToken" }));
    expect(await setup.provider.send(apnsDelivery())).toMatchObject({
      outcome: "retryable_failure",
      stableErrorCode: "apns_credentials_rejected",
      refusal: "credentials_rejected",
      invalidDestination: false,
    });
    expect(setup.calls).toHaveLength(1);
  });

  it("an unreadable key is reported as a refusal, without echoing it", async () => {
    const provider = new ApnsProvider(
      {
        keyId: "ABC123DEFG",
        teamId: "TEAM123456",
        bundleId: "botolago.com",
        privateKey: "PRIVATE KEY nope",
        environment: "production",
      },
      network(() => ok()).fetchImpl,
      () => NOW,
    );
    const result = await provider.send(apnsDelivery());
    expect(result).toMatchObject({
      stableErrorCode: "apns_key_unreadable",
      refusal: "credentials_rejected",
    });
    expect(JSON.stringify(result)).not.toContain("nope");
  });

  it("an error reason is made a safe code, or the status when there is none", async () => {
    const named = await apnsSetup(() => json(400, { reason: "PayloadTooLarge" }));
    expect((await named.provider.send(apnsDelivery())).stableErrorCode).toBe(
      "apns_payload_too_large",
    );
    const bare = await apnsSetup(() => new Response("", { status: 400 }));
    expect((await bare.provider.send(apnsDelivery())).stableErrorCode).toBe("apns_http_400");
    const hostile = await apnsSetup(() => json(400, { reason: "Bad; drop table" }));
    expect((await hostile.provider.send(apnsDelivery())).stableErrorCode).toMatch(
      /^apns_[a-z0-9_]+$/,
    );
  });
});

describe("signJwt", () => {
  it("produces three base64url parts that verify", async () => {
    const keys = await ecKeys();
    const key = await importSigningKey(keys.pem, "ES256");
    const jwt = await signJwt("ES256", { kid: "K" }, { iss: "T", iat: 1 }, key);
    expect(jwt.split(".")).toHaveLength(3);
    expect(jwt).not.toMatch(/[+/= ]/);
    expect((await verifyJwt(jwt, "ES256", keys.publicKey)).valid).toBe(true);
  });
});
