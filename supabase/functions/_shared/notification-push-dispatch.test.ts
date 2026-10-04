import { describe, expect, it } from "bun:test";
import {
  buildProviders,
  handlePushDispatchRequest,
  PushDispatchError,
  pushDispatchConfiguration,
  readClaimedPushDeliveries,
  runPushDispatch,
  type PushRpcClient,
} from "./notification-push-dispatch.ts";
import {
  outcome,
  type ClaimedPushDelivery,
  type PushProvider,
  type PushProviderKey,
  type PushSendOutcome,
} from "./notification-push-types.ts";

const TOKEN = "a".repeat(64);
const NOW = Date.UTC(2026, 9, 5, 18, 0, 0);

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function delivery(n: number, overrides: Partial<ClaimedPushDelivery> = {}): ClaimedPushDelivery {
  return {
    id: uuid(n),
    notificationId: uuid(1000 + n),
    attemptNumber: 1,
    providerKey: "fcm",
    platform: "android",
    deviceRegistrationId: uuid(2000 + n),
    type: "goal",
    language: "fr",
    title: "But pour le Raja !",
    body: "Raja 1–0 Wydad (34′)",
    deepLink: { target: "match_detail", entityId: uuid(3000 + n) },
    expiresInSeconds: 600,
    destination: `device-token-for-delivery-${n}-0123456789`,
    ...overrides,
  };
}

interface Call {
  readonly name: string;
  readonly args: Record<string, unknown>;
}

/** A database that hands out `batches` in turn, then nothing. */
function fakeClient(batches: unknown[], options: { tokenValid?: boolean; failOn?: string } = {}) {
  const calls: Call[] = [];
  const queue = [...batches];
  const client: PushRpcClient = {
    schema() {
      return {
        rpc(name, args = {}) {
          calls.push({ name, args });
          if (options.failOn === name) {
            return Promise.resolve({ data: null, error: { message: "boom" } });
          }
          if (name === "service_verify_scheduler_token") {
            return Promise.resolve({ data: options.tokenValid ?? true, error: null });
          }
          if (name === "service_claim_push_deliveries") {
            return Promise.resolve({ data: queue.shift() ?? [], error: null });
          }
          if (name === "service_release_push_deliveries") {
            return Promise.resolve({
              data: (args.p_delivery_ids as unknown[]).length,
              error: null,
            });
          }
          if (name === "service_invalidate_notification_device") {
            return Promise.resolve({ data: true, error: null });
          }
          return Promise.resolve({ data: "sent", error: null });
        },
      };
    },
  };
  return { client, calls };
}

const named = (calls: readonly Call[], name: string) =>
  calls.filter((call) => call.name === name).map((call) => call.args);

/** A provider that answers by delivery, and remembers who it was asked about. */
function provider(
  key: PushProviderKey,
  answer: (delivery: ClaimedPushDelivery) => PushSendOutcome | Promise<PushSendOutcome> = () =>
    outcome("sent", { providerMessageId: `${key}-id` }),
) {
  const sent: string[] = [];
  let inFlight = 0;
  let peak = 0;
  const instance: PushProvider = {
    key,
    async send(item) {
      sent.push(item.id);
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      try {
        return await answer(item);
      } finally {
        inFlight -= 1;
      }
    },
  };
  return { instance, sent, peak: () => peak };
}

const config = { batchSize: 5, budgetMs: 60_000, concurrency: 3 };

function dependencies(
  client: PushRpcClient,
  providers: Partial<Record<PushProviderKey, PushProvider>>,
) {
  return { environment: {}, client, providers, now: () => NOW };
}

describe("push dispatch configuration", () => {
  it("applies safe defaults and refuses nonsense", () => {
    expect(pushDispatchConfiguration({})).toEqual({
      batchSize: 50,
      budgetMs: 100_000,
      concurrency: 8,
    });
    expect(
      pushDispatchConfiguration({ PUSH_BATCH_SIZE: "20", PUSH_CONCURRENCY: "2" }),
    ).toMatchObject({
      batchSize: 20,
      concurrency: 2,
    });
    for (const bad of [
      { PUSH_BATCH_SIZE: "0" },
      { PUSH_BATCH_SIZE: "9999" },
      { PUSH_BUDGET_MS: "10" },
      { PUSH_CONCURRENCY: "many" },
    ]) {
      expect(() => pushDispatchConfiguration(bad)).toThrow(PushDispatchError);
    }
  });

  it("builds only the providers whose secrets are usable, and names the rest", () => {
    const none = buildProviders({}, fetch, () => NOW);
    expect(none.providers).toEqual({});
    expect(none.unconfigured).toEqual(["fcm", "apns"]);
    const broken = buildProviders(
      { FCM_SERVICE_ACCOUNT_JSON: "{", APNS_KEY_ID: "x" },
      fetch,
      () => NOW,
    );
    expect(broken.unconfigured).toEqual(["fcm", "apns"]);
  });
});

describe("reading the claim", () => {
  it("accepts well-formed rows and sets malformed ones aside by id", () => {
    const good = delivery(1);
    const result = readClaimedPushDeliveries([
      good,
      { ...delivery(2), destination: "short" },
      { ...delivery(3), providerKey: "expo" },
      { ...delivery(4), language: "en" },
      { ...delivery(5), deepLink: { target: "match_detail", entityId: "not-a-uuid" } },
      { ...delivery(6), expiresInSeconds: 0 },
      { ...delivery(7), title: "" },
    ]);
    expect(result.valid).toEqual([good]);
    expect(result.invalidIds).toEqual([2, 3, 4, 5, 6, 7].map(uuid));
  });

  it("accepts a delivery with no page to open", () => {
    const plain = delivery(1, { deepLink: { target: "none", entityId: null } });
    expect(readClaimedPushDeliveries([plain]).valid).toEqual([plain]);
  });

  it("refuses a payload that is not a list, or a row with no usable id", () => {
    expect(() => readClaimedPushDeliveries({})).toThrow(PushDispatchError);
    expect(() => readClaimedPushDeliveries([{ id: "nope" }])).toThrow(PushDispatchError);
    expect(() => readClaimedPushDeliveries([null])).toThrow(PushDispatchError);
  });
});

describe("a dispatch pass", () => {
  it("claims a batch with the configured size and a lease", async () => {
    const { client, calls } = fakeClient([]);
    const summary = await runPushDispatch(
      config,
      dependencies(client, { fcm: provider("fcm").instance }),
    );
    expect(named(calls, "service_claim_push_deliveries")).toEqual([
      { p_limit: 5, p_lease_seconds: 120 },
    ]);
    expect(summary).toMatchObject({ claimed: 0, sent: 0 });
  });

  it("sends each delivery through its own provider and records it as sent", async () => {
    const fcm = provider("fcm");
    const apns = provider("apns");
    const { client, calls } = fakeClient([
      [delivery(1), delivery(2, { providerKey: "apns", platform: "ios" }), delivery(3)],
    ]);
    const summary = await runPushDispatch(
      config,
      dependencies(client, { fcm: fcm.instance, apns: apns.instance }),
    );
    expect(fcm.sent.sort()).toEqual([uuid(1), uuid(3)]);
    expect(apns.sent).toEqual([uuid(2)]);
    expect(summary).toMatchObject({ claimed: 3, sent: 3, retrying: 0, failed: 0, handedBack: 0 });
    const recorded = named(calls, "service_record_notification_delivery_attempt");
    expect(recorded).toHaveLength(3);
    expect(recorded.find((args) => args.p_delivery_id === uuid(2))).toMatchObject({
      p_outcome: "sent",
      p_retryable: false,
      p_provider_message_id: "apns-id",
      p_max_attempts: 4,
    });
  });

  it("never sends more at once than the concurrency allows, and still sends them all", async () => {
    const fcm = provider("fcm");
    const { client } = fakeClient([[1, 2, 3, 4, 5].map((n) => delivery(n))]);
    await runPushDispatch(config, dependencies(client, { fcm: fcm.instance }));
    expect(fcm.sent).toHaveLength(5);
    expect(fcm.peak()).toBeGreaterThan(1);
    expect(fcm.peak()).toBeLessThanOrEqual(3);
  });

  it("a dead token fails for good and turns the device off", async () => {
    const fcm = provider("fcm", () =>
      outcome("permanent_failure", {
        stableErrorCode: "fcm_unregistered",
        invalidDestination: true,
      }),
    );
    const { client, calls } = fakeClient([[delivery(1)]]);
    const summary = await runPushDispatch(config, dependencies(client, { fcm: fcm.instance }));
    expect(summary).toMatchObject({ failed: 1, devicesTurnedOff: 1, sent: 0 });
    expect(named(calls, "service_record_notification_delivery_attempt")[0]).toMatchObject({
      p_outcome: "permanent_failure",
      p_retryable: false,
      p_stable_error_code: "fcm_unregistered",
    });
    expect(named(calls, "service_invalidate_notification_device")).toEqual([
      { p_device_registration_id: uuid(2001), p_reason_code: "push_token_rejected" },
    ]);
  });

  it("a failure that may pass is recorded as retryable, with the provider's wait", async () => {
    const fcm = provider("fcm", () =>
      outcome("retryable_failure", { stableErrorCode: "fcm_rate_limited", retryAfterSeconds: 45 }),
    );
    const { client, calls } = fakeClient([[delivery(1)]]);
    const summary = await runPushDispatch(config, dependencies(client, { fcm: fcm.instance }));
    expect(summary).toMatchObject({ retrying: 1, failed: 0, devicesTurnedOff: 0 });
    expect(named(calls, "service_record_notification_delivery_attempt")[0]).toMatchObject({
      p_outcome: "retryable_failure",
      p_retryable: true,
      p_retry_after_seconds: 45,
    });
    expect(named(calls, "service_invalidate_notification_device")).toHaveLength(0);
  });

  it("a provider that throws is a retry, not a lost batch", async () => {
    const fcm = provider("fcm", (item) => {
      if (item.id === uuid(2)) throw new Error("socket exploded");
      return outcome("sent");
    });
    const { client, calls } = fakeClient([[delivery(1), delivery(2), delivery(3)]]);
    const summary = await runPushDispatch(config, dependencies(client, { fcm: fcm.instance }));
    expect(summary).toMatchObject({ sent: 2, retrying: 1 });
    expect(
      named(calls, "service_record_notification_delivery_attempt").find(
        (args) => args.p_delivery_id === uuid(2),
      ),
    ).toMatchObject({ p_stable_error_code: "push_send_failed", p_retryable: true });
  });

  it("a malformed row fails for good on its own and does not stop the others", async () => {
    const fcm = provider("fcm");
    const { client, calls } = fakeClient([[delivery(1), { ...delivery(2), destination: "x" }]]);
    const summary = await runPushDispatch(config, dependencies(client, { fcm: fcm.instance }));
    expect(summary).toMatchObject({ claimed: 2, sent: 1, failed: 1 });
    expect(
      named(calls, "service_record_notification_delivery_attempt").find(
        (args) => args.p_delivery_id === uuid(2),
      ),
    ).toMatchObject({
      p_outcome: "permanent_failure",
      p_stable_error_code: "push_payload_invalid",
    });
  });

  it("a provider with no credentials: its pushes are handed back untouched, the other still sends", async () => {
    const apns = provider("apns");
    const { client, calls } = fakeClient([
      [delivery(1), delivery(2, { providerKey: "apns", platform: "ios" }), delivery(3)],
    ]);
    const summary = await runPushDispatch(config, dependencies(client, { apns: apns.instance }));
    expect(apns.sent).toEqual([uuid(2)]);
    expect(summary).toMatchObject({ sent: 1, handedBack: 2, unconfigured: ["fcm"] });
    const released = named(calls, "service_release_push_deliveries");
    expect(released).toHaveLength(1);
    expect((released[0]!.p_delivery_ids as string[]).sort()).toEqual([uuid(1), uuid(3)]);
    expect(released[0]!.p_retry_at).toBe(new Date(NOW + 600_000).toISOString());
    // Handed back, not recorded: no attempt is spent on our own missing key.
    expect(
      named(calls, "service_record_notification_delivery_attempt").map(
        (args) => args.p_delivery_id,
      ),
    ).toEqual([uuid(2)]);
  });

  it("a provider that refuses everything for our reasons is left alone for the rest of the pass", async () => {
    const fcm = provider("fcm", () =>
      outcome("retryable_failure", {
        stableErrorCode: "fcm_credentials_rejected",
        refusal: "credentials_rejected",
      }),
    );
    const apns = provider("apns");
    const { client, calls } = fakeClient([
      [
        delivery(1),
        delivery(2),
        delivery(3),
        delivery(4, { providerKey: "apns", platform: "ios" }),
      ],
    ]);
    const summary = await runPushDispatch(
      { ...config, concurrency: 1 },
      dependencies(client, { fcm: fcm.instance, apns: apns.instance }),
    );
    // The first fcm push found out; the other two were not even tried.
    expect(fcm.sent).toEqual([uuid(1)]);
    expect(apns.sent).toEqual([uuid(4)]);
    expect(summary).toMatchObject({
      sent: 1,
      handedBack: 3,
      refused: { fcm: "credentials_rejected" },
    });
    const released = named(calls, "service_release_push_deliveries");
    expect(released).toHaveLength(1);
    expect((released[0]!.p_delivery_ids as string[]).sort()).toEqual([uuid(1), uuid(2), uuid(3)]);
    expect(released[0]!.p_retry_at).toBe(new Date(NOW + 900_000).toISOString());
    expect(named(calls, "service_record_notification_delivery_attempt")).toHaveLength(1);
  });

  it("a setup problem on our side waits longer than a rejected key", async () => {
    const fcm = provider("fcm", () =>
      outcome("retryable_failure", { refusal: "configuration_rejected" }),
    );
    const { client, calls } = fakeClient([[delivery(1)]]);
    await runPushDispatch(config, dependencies(client, { fcm: fcm.instance }));
    expect(named(calls, "service_release_push_deliveries")[0]!.p_retry_at).toBe(
      new Date(NOW + 1_800_000).toISOString(),
    );
  });

  it("claims again while batches come back full, and stops at the first short one", async () => {
    const fcm = provider("fcm");
    const { client, calls } = fakeClient([
      [1, 2, 3, 4, 5].map((n) => delivery(n)),
      [6, 7, 8, 9, 10].map((n) => delivery(n)),
      [delivery(11)],
      [delivery(12)],
    ]);
    const summary = await runPushDispatch(config, dependencies(client, { fcm: fcm.instance }));
    expect(named(calls, "service_claim_push_deliveries")).toHaveLength(3);
    expect(summary).toMatchObject({ claimed: 11, sent: 11 });
  });

  it("does not churn when a whole batch had to be handed back", async () => {
    const { client, calls } = fakeClient([
      [1, 2, 3, 4, 5].map((n) => delivery(n)),
      [6, 7, 8, 9, 10].map((n) => delivery(n)),
    ]);
    const summary = await runPushDispatch(config, dependencies(client, {}));
    expect(named(calls, "service_claim_push_deliveries")).toHaveLength(1);
    expect(summary).toMatchObject({ handedBack: 5, sent: 0, unconfigured: ["fcm", "apns"] });
  });

  it("stops claiming once its time budget is spent", async () => {
    const fcm = provider("fcm");
    let clock = NOW;
    const { client, calls } = fakeClient([
      [1, 2, 3, 4, 5].map((n) => delivery(n)),
      [6, 7, 8, 9, 10].map((n) => delivery(n)),
    ]);
    await runPushDispatch(
      { ...config, budgetMs: 1_000 },
      {
        environment: {},
        client,
        providers: { fcm: fcm.instance },
        now: () => {
          const value = clock;
          clock += 600;
          return value;
        },
      },
    );
    expect(named(calls, "service_claim_push_deliveries").length).toBeLessThan(3);
  });

  it("a database that stops answering ends the pass with a code, not a crash", async () => {
    const { client } = fakeClient([[delivery(1)]], {
      failOn: "service_record_notification_delivery_attempt",
    });
    await expect(
      runPushDispatch(config, dependencies(client, { fcm: provider("fcm").instance })),
    ).rejects.toThrow("database_unavailable");
  });
});

describe("the request", () => {
  const request = (token = TOKEN, method = "POST") =>
    new Request("https://functions.example/notification-push-dispatch", {
      method,
      headers: { "x-botolago-scheduler-token": token },
      body: method === "POST" ? "{}" : undefined,
    });

  it("only answers POST", async () => {
    const { client } = fakeClient([]);
    const response = await handlePushDispatchRequest(
      request(TOKEN, "GET"),
      dependencies(client, {}),
    );
    expect(response.status).toBe(405);
  });

  it("refuses a missing, malformed or wrong scheduler token before touching a delivery", async () => {
    for (const token of ["", "short", "G".repeat(64)]) {
      const { client, calls } = fakeClient([]);
      const response = await handlePushDispatchRequest(request(token), dependencies(client, {}));
      expect(response.status).toBe(401);
      expect(calls).toHaveLength(0);
    }
    const { client, calls } = fakeClient([], { tokenValid: false });
    const response = await handlePushDispatchRequest(request(), dependencies(client, {}));
    expect(response.status).toBe(401);
    expect(named(calls, "service_claim_push_deliveries")).toHaveLength(0);
  });

  it("answers 503 when it cannot check the token, and 502 when a pass fails", async () => {
    const down = fakeClient([], { failOn: "service_verify_scheduler_token" });
    expect((await handlePushDispatchRequest(request(), dependencies(down.client, {}))).status).toBe(
      503,
    );
    const broken = fakeClient([[delivery(1)]], { failOn: "service_claim_push_deliveries" });
    const response = await handlePushDispatchRequest(
      request(),
      dependencies(broken.client, { fcm: provider("fcm").instance }),
    );
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "database_unavailable" });
  });

  it("answers 503 for a bad configuration, with nothing claimed", async () => {
    const { client, calls } = fakeClient([[delivery(1)]]);
    const response = await handlePushDispatchRequest(request(), {
      environment: { PUSH_BATCH_SIZE: "0" },
      client,
      providers: {},
    });
    expect(response.status).toBe(503);
    expect(named(calls, "service_claim_push_deliveries")).toHaveLength(0);
  });

  it("returns counts only: no device token, no title, no body", async () => {
    const { client } = fakeClient([[delivery(1), delivery(2)]]);
    const response = await handlePushDispatchRequest(
      request(),
      dependencies(client, { fcm: provider("fcm").instance }),
    );
    expect(response.status).toBe(200);
    const text = JSON.stringify(await response.json());
    expect(text).toContain('"sent":2');
    expect(text).not.toContain("device-token");
    expect(text).not.toContain("Raja");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
