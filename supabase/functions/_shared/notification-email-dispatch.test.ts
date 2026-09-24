import { describe, expect, it } from "bun:test";
import {
  emailDispatchConfiguration,
  EmailDispatchError,
  handleEmailDispatchRequest,
  readClaimedDeliveries,
  type EmailRpcClient,
} from "./notification-email-dispatch.ts";
import type { ClaimedEmailDelivery } from "./notification-email-types.ts";

const TOKEN = "a".repeat(64);
const API_KEY = "re_test_0123456789abcdef";

function delivery(id: string, email = "fan@example.test"): ClaimedEmailDelivery {
  return {
    id,
    notificationId: "00000000-0000-4000-8000-0000000000aa",
    attemptNumber: 1,
    type: "deadline_24h",
    language: "fr",
    timezone: "Africa/Casablanca",
    recipient: { email, displayName: "Sara" },
    favoriteTeamId: null,
    unsubscribeToken: "A".repeat(32),
    payload: {
      gameweek: { id: "00000000-0000-4000-8000-0000000000bb", sequence: 3, name: "3" },
      deadlineAt: "2026-10-02T14:30:00Z",
    },
  };
}

const ID1 = "11111111-1111-4111-8111-111111111111";
const ID2 = "22222222-2222-4222-8222-222222222222";
const ID3 = "33333333-3333-4333-8333-333333333333";

interface Call {
  readonly name: string;
  readonly args: Record<string, unknown> | undefined;
}

function fakeClient(batches: unknown[][], options: { tokenValid?: boolean } = {}) {
  const calls: Call[] = [];
  const queue = [...batches];
  const client: EmailRpcClient = {
    schema() {
      return {
        rpc(name: string, args?: Record<string, unknown>) {
          calls.push({ name, args });
          if (name === "service_verify_scheduler_token") {
            return Promise.resolve({ data: options.tokenValid ?? true, error: null });
          }
          if (name === "service_claim_email_deliveries") {
            return Promise.resolve({ data: queue.shift() ?? [], error: null });
          }
          return Promise.resolve({ data: "sent", error: null });
        },
      };
    },
  };
  return { client, calls };
}

function recorded(calls: readonly Call[]) {
  return calls
    .filter((call) => call.name === "service_record_notification_delivery_attempt")
    .map((call) => call.args ?? {});
}

function request(token = TOKEN, method = "POST"): Request {
  return new Request("https://functions.example/notification-email-dispatch", {
    method,
    headers: { "content-type": "application/json", "x-botolago-scheduler-token": token },
    body: method === "POST" ? '{"job":"dispatch"}' : undefined,
  });
}

const render = (item: ClaimedEmailDelivery) => ({
  subject: `Subject ${item.id}`,
  preheader: "Preheader",
  html: "<p>Hello</p>",
  text: "Hello",
});
const unsubscribeUrl = (item: ClaimedEmailDelivery) =>
  `https://botolago.com/unsubscribe?token=${item.unsubscribeToken}`;

function dependencies(
  client: EmailRpcClient,
  fetchImpl: (input: string | URL | Request, init?: RequestInit) => Promise<Response>,
  environment: Record<string, string> = { RESEND_API_KEY: API_KEY },
) {
  return {
    environment,
    client,
    render,
    unsubscribeUrl,
    fetch: fetchImpl,
    sleep: async () => {},
  };
}

describe("email dispatch configuration", () => {
  it("requires a provider key and applies safe defaults", () => {
    expect(() => emailDispatchConfiguration({})).toThrow(EmailDispatchError);
    const config = emailDispatchConfiguration({ RESEND_API_KEY: API_KEY });
    expect(config.from).toBe("BotolaGO <notifications@botolago.com>");
    expect(config.replyTo).toBe("support@botolago.com");
    expect(config.appUrl).toBe("https://botolago.com");
    expect(config.batchSize).toBe(20);
    expect(config.sendIntervalMs).toBe(200);
    expect(config.oneClickUnsubscribeEndpoint).toBeNull();
  });

  it("only builds a one-click endpoint on an https functions origin", () => {
    expect(
      emailDispatchConfiguration({
        RESEND_API_KEY: API_KEY,
        SUPABASE_URL: "https://project.supabase.co/",
      }).oneClickUnsubscribeEndpoint,
    ).toBe("https://project.supabase.co/functions/v1/notification-email-unsubscribe");
    expect(
      emailDispatchConfiguration({ RESEND_API_KEY: API_KEY, SUPABASE_URL: "http://kong:8000" })
        .oneClickUnsubscribeEndpoint,
    ).toBeNull();
  });

  it("refuses an app URL that is not a bare https origin and a malformed sender", () => {
    expect(() =>
      emailDispatchConfiguration({ RESEND_API_KEY: API_KEY, APP_URL: "http://botolago.com" }),
    ).toThrow(EmailDispatchError);
    expect(() =>
      emailDispatchConfiguration({ RESEND_API_KEY: API_KEY, APP_URL: "https://botolago.com/x" }),
    ).toThrow(EmailDispatchError);
    expect(() =>
      emailDispatchConfiguration({ RESEND_API_KEY: API_KEY, EMAIL_FROM: "BotolaGO <nope" }),
    ).toThrow(EmailDispatchError);
    expect(
      emailDispatchConfiguration({ RESEND_API_KEY: API_KEY, APP_URL: "https://botolago.com/" })
        .appUrl,
    ).toBe("https://botolago.com");
  });
});

describe("claimed delivery validation", () => {
  it("separates malformed rows instead of failing the batch", () => {
    const bad = { ...delivery(ID2), unsubscribeToken: "short" };
    const result = readClaimedDeliveries([delivery(ID1), bad]);
    expect(result.valid.map((item) => item.id)).toEqual([ID1]);
    expect(result.invalidIds).toEqual([ID2]);
  });

  it("rejects a payload that is not a list of deliveries", () => {
    expect(() => readClaimedDeliveries({})).toThrow(EmailDispatchError);
    expect(() => readClaimedDeliveries([{ id: "not-a-uuid" }])).toThrow(EmailDispatchError);
  });
});

describe("email dispatch request", () => {
  it("only answers POST with a valid scheduler token", async () => {
    const { client } = fakeClient([]);
    const fetchNever = async () => {
      throw new Error("provider must not be called");
    };
    expect(
      (await handleEmailDispatchRequest(request(TOKEN, "GET"), dependencies(client, fetchNever)))
        .status,
    ).toBe(405);
    expect(
      (await handleEmailDispatchRequest(request("nope"), dependencies(client, fetchNever))).status,
    ).toBe(401);
    const rejected = fakeClient([], { tokenValid: false });
    expect(
      (await handleEmailDispatchRequest(request(), dependencies(rejected.client, fetchNever)))
        .status,
    ).toBe(401);
  });

  it("claims nothing when the provider is not configured", async () => {
    const { client, calls } = fakeClient([[delivery(ID1)]]);
    const response = await handleEmailDispatchRequest(
      request(),
      dependencies(client, async () => new Response("{}"), {}),
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "email_provider_not_configured" });
    expect(calls.some((call) => call.name === "service_claim_email_deliveries")).toBe(false);
  });

  it("sends each claimed email once with its id as the idempotency key and records it", async () => {
    const { client, calls } = fakeClient([[delivery(ID1), delivery(ID2, "other@example.test")]]);
    const sent: Array<{ headers: Headers; body: Record<string, unknown> }> = [];
    const fetchImpl = async (_input: string | URL | Request, init?: RequestInit) => {
      sent.push({
        headers: new Headers(init?.headers),
        body: JSON.parse(String(init?.body)) as Record<string, unknown>,
      });
      return Response.json({ id: `resend-${sent.length}` });
    };
    const response = await handleEmailDispatchRequest(request(), dependencies(client, fetchImpl));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ claimed: 2, sent: 2, retrying: 0, failed: 0 });

    expect(sent).toHaveLength(2);
    expect(sent[0].headers.get("idempotency-key")).toBe(`botolago-email-${ID1}`);
    expect(sent[0].headers.get("authorization")).toBe(`Bearer ${API_KEY}`);
    expect(sent[0].body.to).toEqual(["fan@example.test"]);
    expect(sent[0].body.from).toBe("BotolaGO <notifications@botolago.com>");
    expect(sent[0].body.headers).toEqual({
      "List-Unsubscribe": `<https://botolago.com/unsubscribe?token=${"A".repeat(32)}>`,
    });

    const records = recorded(calls);
    expect(
      records.map((record) => [
        record.p_delivery_id,
        record.p_outcome,
        record.p_provider_message_id,
      ]),
    ).toEqual([
      [ID1, "sent", "resend-1"],
      [ID2, "sent", "resend-2"],
    ]);
  });

  it("never puts an address or provider body in its response", async () => {
    const { client } = fakeClient([[delivery(ID1)]]);
    const response = await handleEmailDispatchRequest(
      request(),
      dependencies(
        client,
        async () => new Response('{"message":"fan@example.test is bad"}', { status: 422 }),
      ),
    );
    const text = await response.text();
    expect(text).not.toContain("@");
    expect(text).not.toContain("bad");
  });

  it("classifies provider failures: rate limit and outages retry, a rejected address does not", async () => {
    const statuses = [429, 503, 422];
    const { client, calls } = fakeClient([[delivery(ID1), delivery(ID2), delivery(ID3)]]);
    const fetchImpl = async () => {
      const status = statuses.shift() ?? 200;
      return new Response("{}", {
        status,
        headers: status === 429 ? { "retry-after": "7" } : {},
      });
    };
    const response = await handleEmailDispatchRequest(request(), dependencies(client, fetchImpl));
    expect(await response.json()).toEqual({ claimed: 3, sent: 0, retrying: 2, failed: 1 });
    const records = recorded(calls);
    expect(records[0]).toMatchObject({
      p_outcome: "retryable_failure",
      p_retryable: true,
      p_stable_error_code: "delivery_rate_limited",
      p_retry_after_seconds: 7,
      p_max_attempts: 5,
    });
    expect(records[1]).toMatchObject({
      p_outcome: "retryable_failure",
      p_stable_error_code: "delivery_provider_error",
    });
    expect(records[2]).toMatchObject({
      p_outcome: "permanent_failure",
      p_retryable: false,
      p_stable_error_code: "delivery_rejected_invalid",
    });
  });

  it("treats a network error or a timeout as retryable", async () => {
    const { client, calls } = fakeClient([[delivery(ID1)]]);
    await handleEmailDispatchRequest(
      request(),
      dependencies(client, async () => {
        throw new TypeError("connection reset");
      }),
    );
    expect(recorded(calls)[0]).toMatchObject({
      p_outcome: "retryable_failure",
      p_stable_error_code: "delivery_network_error",
    });
  });

  it("stops the pass, pauses sending and keeps the rest when the provider refuses the key", async () => {
    let providerCalls = 0;
    const clock = Date.parse("2026-09-26T10:00:00Z");
    const { client, calls } = fakeClient([[delivery(ID1), delivery(ID2), delivery(ID3)]]);
    const response = await handleEmailDispatchRequest(request(), {
      ...dependencies(client, async () => {
        providerCalls += 1;
        return new Response('{"name":"restricted_api_key"}', { status: 401 });
      }),
      now: () => clock,
    });
    expect(providerCalls).toBe(1);
    expect(await response.json()).toEqual({
      claimed: 3,
      sent: 0,
      retrying: 3,
      failed: 0,
      pausedReason: "provider_auth_failed",
    });
    // Nothing was tried on these emails: none of them spends an attempt.
    expect(recorded(calls)).toEqual([]);
    expect(calls.find((call) => call.name === "service_pause_email_provider")?.args).toEqual({
      p_reason: "provider_auth_failed",
      p_until: "2026-09-26T10:30:00.000Z",
    });
    expect(calls.find((call) => call.name === "service_release_email_deliveries")?.args).toEqual({
      p_delivery_ids: [ID1, ID2, ID3],
      p_retry_at: "2026-09-26T10:30:00.000Z",
    });
  });

  it("pauses until midnight UTC when the plan's daily quota is spent", async () => {
    let providerCalls = 0;
    const clock = Date.parse("2026-09-26T21:30:00Z");
    const { client, calls } = fakeClient([[delivery(ID1), delivery(ID2)]]);
    const response = await handleEmailDispatchRequest(request(), {
      ...dependencies(client, async () => {
        providerCalls += 1;
        return new Response(
          '{"name":"daily_quota_exceeded","message":"You have exceeded your daily email sending quota."}',
          { status: 429 },
        );
      }),
      now: () => clock,
    });
    expect(providerCalls).toBe(1);
    expect(await response.json()).toMatchObject({
      retrying: 2,
      pausedReason: "daily_quota_exceeded",
    });
    expect(calls.find((call) => call.name === "service_pause_email_provider")?.args).toEqual({
      p_reason: "daily_quota_exceeded",
      p_until: "2026-09-27T00:01:00.000Z",
    });
    expect(recorded(calls)).toEqual([]);
    expect(calls.find((call) => call.name === "service_release_email_deliveries")?.args).toEqual({
      p_delivery_ids: [ID1, ID2],
      p_retry_at: "2026-09-27T00:01:00.000Z",
    });
  });

  it("pauses until the first of next month when the monthly quota is spent", async () => {
    const clock = Date.parse("2026-09-30T08:00:00Z");
    const { client, calls } = fakeClient([[delivery(ID1)]]);
    await handleEmailDispatchRequest(request(), {
      ...dependencies(
        client,
        async () => new Response('{"name":"monthly_quota_exceeded"}', { status: 429 }),
      ),
      now: () => clock,
    });
    expect(calls.find((call) => call.name === "service_pause_email_provider")?.args).toEqual({
      p_reason: "monthly_quota_exceeded",
      p_until: "2026-10-01T00:01:00.000Z",
    });
  });

  it("treats a reused idempotency key as already sent, never as a reason to send again", async () => {
    const { client, calls } = fakeClient([[delivery(ID1)]]);
    const response = await handleEmailDispatchRequest(
      request(),
      dependencies(
        client,
        async () => new Response('{"name":"invalid_idempotent_request"}', { status: 409 }),
      ),
    );
    expect(await response.json()).toEqual({ claimed: 1, sent: 1, retrying: 0, failed: 0 });
    expect(recorded(calls)[0]).toMatchObject({ p_outcome: "sent", p_stable_error_code: null });
  });

  it("waits and retries while the same key is still being processed", async () => {
    const { client, calls } = fakeClient([[delivery(ID1)]]);
    await handleEmailDispatchRequest(
      request(),
      dependencies(
        client,
        async () => new Response('{"name":"concurrent_idempotent_requests"}', { status: 409 }),
      ),
    );
    expect(recorded(calls)[0]).toMatchObject({
      p_outcome: "retryable_failure",
      p_stable_error_code: "delivery_in_progress",
      p_retry_after_seconds: 120,
    });
    expect(calls.some((call) => call.name === "service_pause_email_provider")).toBe(false);
  });

  it("offers one-click unsubscribe when the functions origin is known", async () => {
    const { client } = fakeClient([[delivery(ID1)]]);
    const sent: Array<Record<string, unknown>> = [];
    await handleEmailDispatchRequest(
      request(),
      dependencies(
        client,
        async (_input, init) => {
          sent.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
          return Response.json({ id: "ok" });
        },
        { RESEND_API_KEY: API_KEY, SUPABASE_URL: "https://project.supabase.co" },
      ),
    );
    expect(sent[0].headers).toEqual({
      "List-Unsubscribe": `<https://project.supabase.co/functions/v1/notification-email-unsubscribe?token=${"A".repeat(32)}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
  });

  it("fails a delivery whose email cannot be rendered without touching the others", async () => {
    const { client, calls } = fakeClient([[delivery(ID1), delivery(ID2)]]);
    const deps = {
      ...dependencies(client, async () => Response.json({ id: "ok" })),
      render: (item: ClaimedEmailDelivery) => {
        if (item.id === ID1) throw new Error("boom");
        return render(item);
      },
    };
    const response = await handleEmailDispatchRequest(request(), deps);
    expect(await response.json()).toEqual({ claimed: 2, sent: 1, retrying: 0, failed: 1 });
    expect(recorded(calls)[0]).toMatchObject({
      p_delivery_id: ID1,
      p_outcome: "permanent_failure",
      p_stable_error_code: "template_render_failed",
    });
  });

  it("keeps claiming full batches until the queue is empty", async () => {
    const { client, calls } = fakeClient([[delivery(ID1)], [delivery(ID2)], []]);
    const response = await handleEmailDispatchRequest(
      request(),
      dependencies(client, async () => Response.json({ id: "ok" }), {
        RESEND_API_KEY: API_KEY,
        EMAIL_DISPATCH_BATCH_SIZE: "1",
      }),
    );
    expect(await response.json()).toEqual({ claimed: 2, sent: 2, retrying: 0, failed: 0 });
    expect(calls.filter((call) => call.name === "service_claim_email_deliveries")).toHaveLength(3);
  });
});
