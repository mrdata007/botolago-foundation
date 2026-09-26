import { describe, expect, it } from "bun:test";
import {
  emailDispatchConfiguration,
  EmailDispatchError,
  handleEmailDispatchRequest,
  readClaimedDeliveries,
  sha256Hex,
  type EmailRpcClient,
} from "./notification-email-dispatch.ts";
import {
  renderNotificationEmail,
  unsubscribeUrl as renderUnsubscribeUrl,
} from "./notification-email-render.ts";
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

  it("keeps the timeout armed while a stalled response body is read", async () => {
    const { client, calls } = fakeClient([[delivery(ID1), delivery(ID2)]]);
    const stalledBody = (signal: AbortSignal | null | undefined, status: number) =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('{"na'));
            signal?.addEventListener("abort", () => controller.error(new Error("aborted")));
          },
        }),
        { status },
      );
    const statuses = [200, 500];
    const started = Date.now();
    const response = await handleEmailDispatchRequest(
      request(),
      dependencies(
        client,
        async (_input, init) => stalledBody(init?.signal, statuses.shift() ?? 200),
        { RESEND_API_KEY: API_KEY, EMAIL_PROVIDER_TIMEOUT_MS: "1000" },
      ),
    );
    expect(Date.now() - started).toBeLessThan(5000);
    // Accepted with a lost body is still sent; a stalled error is classified by status.
    expect(await response.json()).toEqual({ claimed: 2, sent: 1, retrying: 1, failed: 0 });
    expect(recorded(calls)[1]).toMatchObject({ p_stable_error_code: "delivery_provider_error" });
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

describe("pepites_weekly through the dispatcher", () => {
  const PEPITES_ID = "44444444-4444-4444-8444-444444444444";

  function pepitesDelivery(
    language: "fr" | "ar",
    extra: Partial<Record<"bodySha256" | "email", string>> = {},
  ): ClaimedEmailDelivery {
    return {
      id: PEPITES_ID,
      notificationId: "00000000-0000-4000-8000-0000000000cc",
      attemptNumber: 1,
      type: "pepites_weekly",
      language,
      timezone: "Africa/Casablanca",
      recipient: { email: extra.email ?? "fan@example.test", displayName: "Sara" },
      favoriteTeamId: null,
      unsubscribeToken: "P".repeat(32),
      unsubscribeTopic: "pepites_weekly",
      firstAttemptAt: "2026-10-12T19:05:00Z",
      bodySha256: extra.bodySha256 ?? null,
      payload: {
        editionId: "00000000-0000-4000-8000-0000000000dd",
        seasonId: "00000000-0000-4000-8000-0000000000ee",
        week: 16,
        round: 5,
        publishedAt: "2026-10-12T19:00:00Z",
        correctsEditionId: null,
        entries: Array.from({ length: 10 }, (_, index) => ({
          rank: index + 1,
          playerId: `00000000-0000-4000-8000-0000000001${String(index).padStart(2, "0")}`,
          name: `Joueur ${index + 1}`,
          club: {
            id: "club",
            name: { fr: "Raja Casablanca", ar: "الرجاء الرياضي" },
            shortName: { fr: "Raja", ar: "الرجاء" },
          },
          score: 90 - index * 2,
        })),
      },
    };
  }

  const realDependencies = (
    client: EmailRpcClient,
    fetchImpl: (input: string | URL | Request, init?: RequestInit) => Promise<Response>,
  ) => ({
    environment: { RESEND_API_KEY: API_KEY, SUPABASE_URL: "https://project.supabase.co" },
    client,
    render: renderNotificationEmail,
    unsubscribeUrl: renderUnsubscribeUrl,
    fetch: fetchImpl,
    sleep: async () => {},
  });

  /**
   * Resend's idempotency, as documented: a key is remembered for 24 hours; the
   * same key and body inside them returns the first result without sending;
   * the same key with another body is refused; after them, it sends again.
   */
  function fakeResend(clock: { now: number }) {
    const sent: Array<{ key: string; body: Record<string, unknown> }> = [];
    const seen = new Map<string, { at: number; body: string; id: string }>();
    let loseNextResponse = false;
    const fetchImpl = async (_input: string | URL | Request, init?: RequestInit) => {
      const key = new Headers(init?.headers).get("idempotency-key") ?? "";
      const body = String(init?.body);
      const earlier = seen.get(key);
      if (earlier && clock.now - earlier.at < 24 * 3600 * 1000) {
        if (earlier.body !== body) {
          return new Response('{"name":"invalid_idempotent_request"}', { status: 409 });
        }
        return Response.json({ id: earlier.id });
      }
      const id = `resend-${sent.length + 1}`;
      sent.push({ key, body: JSON.parse(body) as Record<string, unknown> });
      seen.set(key, { at: clock.now, body, id });
      if (loseNextResponse) {
        loseNextResponse = false;
        throw new TypeError("connection reset after the provider accepted");
      }
      return Response.json({ id });
    };
    return {
      fetchImpl,
      sent,
      loseNext: () => {
        loseNextResponse = true;
      },
    };
  }

  for (const [language, subject, unsubscribeLabel] of [
    ["fr", "Pépites · Semaine 16 : le Top 10 des jeunes", "Se désabonner de Pépites"],
    ["ar", "Pépites · الأسبوع 16: توب 10 للشباب", "إلغاء الاشتراك في Pépites"],
  ] as const) {
    it(`sends a claimed Pépites email in ${language} and records it with its body hash`, async () => {
      const { client, calls } = fakeClient([[pepitesDelivery(language)]]);
      const clock = { now: Date.parse("2026-10-12T19:05:00Z") };
      const resend = fakeResend(clock);
      const response = await handleEmailDispatchRequest(request(), {
        ...realDependencies(client, resend.fetchImpl),
        now: () => clock.now,
      });
      expect(await response.json()).toEqual({ claimed: 1, sent: 1, retrying: 0, failed: 0 });
      expect(resend.sent).toHaveLength(1);
      const body = resend.sent[0]!.body;
      expect(body.subject).toBe(subject);
      expect(String(body.html)).toContain(unsubscribeLabel);
      expect(String(body.text)).toContain(
        `https://botolago.com/unsubscribe?token=${"P".repeat(32)}&topic=pepites_weekly`,
      );
      expect(body.headers).toEqual({
        "List-Unsubscribe": `<https://project.supabase.co/functions/v1/notification-email-unsubscribe?token=${"P".repeat(32)}&topic=pepites_weekly>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      });
      expect(body.tags).toEqual([
        { name: "category", value: "notification" },
        { name: "type", value: "pepites_weekly" },
      ]);
      const [record] = recorded(calls);
      expect(record).toMatchObject({ p_delivery_id: PEPITES_ID, p_outcome: "sent" });
      // The hash is of the exact bytes sent (the body round-trips unchanged).
      expect(record!.p_body_sha256).toBe(await sha256Hex(JSON.stringify(body)));
    });
  }

  it("accepted but the answer lost: the retry an hour later sends the same key and body, and there is one email", async () => {
    const clock = { now: Date.parse("2026-10-12T19:05:00Z") };
    const resend = fakeResend(clock);
    resend.loseNext();

    const first = fakeClient([[pepitesDelivery("fr")]]);
    await handleEmailDispatchRequest(request(), {
      ...realDependencies(first.client, resend.fetchImpl),
      now: () => clock.now,
    });
    const [firstRecord] = recorded(first.calls);
    expect(firstRecord).toMatchObject({
      p_outcome: "retryable_failure",
      p_stable_error_code: "delivery_network_error",
    });
    const firstHash = firstRecord!.p_body_sha256 as string;
    expect(firstHash).toMatch(/^[0-9a-f]{64}$/);

    // The claim hands it back an hour later with the first attempt's hash.
    clock.now += 3600 * 1000;
    const second = fakeClient([
      [{ ...pepitesDelivery("fr", { bodySha256: firstHash }), attemptNumber: 2 }],
    ]);
    const response = await handleEmailDispatchRequest(request(), {
      ...realDependencies(second.client, resend.fetchImpl),
      now: () => clock.now,
    });
    expect(await response.json()).toEqual({ claimed: 1, sent: 1, retrying: 0, failed: 0 });
    expect(recorded(second.calls)[0]).toMatchObject({
      p_outcome: "sent",
      p_provider_message_id: "resend-1",
      p_body_sha256: firstHash,
    });
    expect(resend.sent).toHaveLength(1);
  });

  it("refuses to send a retry whose body would differ from the first attempt's", async () => {
    const clock = { now: Date.parse("2026-10-12T20:05:00Z") };
    const resend = fakeResend(clock);
    // The first attempt went to another address, so its body hash differs.
    const { client, calls } = fakeClient([
      [pepitesDelivery("fr", { bodySha256: "0".repeat(64), email: "new@example.test" })],
    ]);
    const response = await handleEmailDispatchRequest(request(), {
      ...realDependencies(client, resend.fetchImpl),
      now: () => clock.now,
    });
    expect(await response.json()).toEqual({ claimed: 1, sent: 0, retrying: 0, failed: 1 });
    expect(resend.sent).toHaveLength(0);
    expect(recorded(calls)[0]).toMatchObject({
      p_outcome: "cancelled",
      p_retryable: false,
      p_stable_error_code: "delivery_body_changed",
    });
  });

  it("rejects a claimed row with a malformed body hash or an unknown topic", () => {
    const result = readClaimedDeliveries([
      { ...pepitesDelivery("fr"), bodySha256: "nope" },
      { ...pepitesDelivery("fr"), id: ID1, unsubscribeTopic: "everything" },
      { ...pepitesDelivery("fr"), id: ID2 },
    ]);
    expect(result.valid.map((item) => item.id)).toEqual([ID2]);
    expect(result.invalidIds).toEqual([PEPITES_ID, ID1]);
  });
});
