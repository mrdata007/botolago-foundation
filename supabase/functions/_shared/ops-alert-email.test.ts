import { describe, expect, it } from "bun:test";
import type { EmailRpcClient } from "./notification-email-dispatch.ts";
import { handleOpsAlertEmailRequest, readOpsAlertMessage } from "./ops-alert-email.ts";

const TOKEN = "b".repeat(64);
const API_KEY = "re_test_0123456789abcdef";
const OWNER = "owner@example.test";
const MESSAGE = {
  subject: "[BotolaGO] Production FAIL: cron_jobs",
  text: "[BotolaGO production] FAIL at 2026-09-25 17:00 UTC\n- cron_jobs [fail]: failed",
};

function fakeClient(options: { tokenValid?: boolean; recipient?: unknown; broken?: string } = {}) {
  const calls: string[] = [];
  const client: EmailRpcClient = {
    schema() {
      return {
        rpc(name: string) {
          calls.push(name);
          if (name === options.broken) return Promise.resolve({ data: null, error: { code: "x" } });
          if (name === "service_verify_scheduler_token") {
            return Promise.resolve({ data: options.tokenValid ?? true, error: null });
          }
          if (name === "service_ops_alert_email_target") {
            return Promise.resolve({
              data: "recipient" in options ? options.recipient : OWNER,
              error: null,
            });
          }
          return Promise.resolve({ data: null, error: { code: "unknown_rpc" } });
        },
      };
    },
  };
  return { client, calls };
}

function request(body: unknown = MESSAGE, token = TOKEN, method = "POST") {
  return new Request("https://example.test/functions/v1/ops-alert-email", {
    method,
    headers: { "content-type": "application/json", "x-botolago-scheduler-token": token },
    body: method === "POST" ? JSON.stringify(body) : undefined,
  });
}

function provider(status = 200, body: unknown = { id: "email-1" }) {
  const sent: Array<{ url: string; init: RequestInit }> = [];
  const fetchImpl = ((url: string, init: RequestInit) => {
    sent.push({ url, init });
    return Promise.resolve(new Response(JSON.stringify(body), { status }));
  }) as unknown as typeof fetch;
  return { fetchImpl, sent };
}

const environment = { RESEND_API_KEY: API_KEY };

describe("ops alert email", () => {
  it("mails the configured owner the subject and text it was given", async () => {
    const { client } = fakeClient();
    const { fetchImpl, sent } = provider();
    const response = await handleOpsAlertEmailRequest(request(), {
      environment,
      client,
      fetchImpl,
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ sent: true, id: "email-1" });
    expect(sent).toHaveLength(1);
    expect(sent[0].url).toBe("https://api.resend.com/emails");
    const payload = JSON.parse(String(sent[0].init.body));
    expect(payload).toEqual({
      from: "BotolaGO <notifications@botolago.com>",
      to: [OWNER],
      reply_to: "support@botolago.com",
      subject: MESSAGE.subject,
      text: MESSAGE.text,
    });
    expect(new Headers(sent[0].init.headers).get("authorization")).toBe(`Bearer ${API_KEY}`);
  });

  it("never takes a recipient from the request", async () => {
    const { client } = fakeClient();
    const { fetchImpl, sent } = provider();
    await handleOpsAlertEmailRequest(request({ ...MESSAGE, to: "attacker@example.test" }), {
      environment,
      client,
      fetchImpl,
    });
    expect(JSON.parse(String(sent[0].init.body)).to).toEqual([OWNER]);
  });

  it("refuses callers without the scheduler token, before reading anything else", async () => {
    for (const [token, valid] of [
      ["", true],
      ["not-a-token", true],
      [TOKEN, false],
    ] as const) {
      const { client, calls } = fakeClient({ tokenValid: valid });
      const { fetchImpl, sent } = provider();
      const response = await handleOpsAlertEmailRequest(request(MESSAGE, token), {
        environment,
        client,
        fetchImpl,
      });
      expect(response.status).toBe(401);
      expect(sent).toHaveLength(0);
      expect(calls).not.toContain("service_ops_alert_email_target");
    }
    const { client } = fakeClient();
    const get = await handleOpsAlertEmailRequest(request(MESSAGE, TOKEN, "GET"), {
      environment,
      client,
    });
    expect(get.status).toBe(405);
  });

  it("sends nothing when no address is configured or the key is missing", async () => {
    for (const recipient of [null, "", "not an address", `${"a".repeat(250)}@x.io`]) {
      const { client } = fakeClient({ recipient });
      const { fetchImpl, sent } = provider();
      const response = await handleOpsAlertEmailRequest(request(), {
        environment,
        client,
        fetchImpl,
      });
      expect(response.status).toBe(409);
      expect(sent).toHaveLength(0);
    }
    const { client } = fakeClient();
    const { fetchImpl, sent } = provider();
    const response = await handleOpsAlertEmailRequest(request(), {
      environment: {},
      client,
      fetchImpl,
    });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "email_provider_not_configured" });
    expect(sent).toHaveLength(0);
  });

  it("rejects malformed messages", async () => {
    for (const body of [
      null,
      [],
      { subject: "x" },
      { subject: "", text: "t" },
      { subject: "line\nbreak", text: "t" },
      { subject: "s".repeat(201), text: "t" },
      { subject: "s", text: "t".repeat(4001) },
    ]) {
      expect(readOpsAlertMessage(body)).toBeNull();
      const { client } = fakeClient();
      const { fetchImpl, sent } = provider();
      const response = await handleOpsAlertEmailRequest(request(body), {
        environment,
        client,
        fetchImpl,
      });
      expect(response.status).toBe(400);
      expect(sent).toHaveLength(0);
    }
  });

  it("reports provider and database failures by code only", async () => {
    const { client } = fakeClient();
    const rejected = provider(403, {
      name: "invalid_from_address",
      message: `cannot send to ${OWNER} from botolago.com`,
    });
    const response = await handleOpsAlertEmailRequest(request(), {
      environment,
      client,
      fetchImpl: rejected.fetchImpl,
    });
    expect(response.status).toBe(502);
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({ error: "invalid_from_address", status: 403 });
    expect(text).not.toContain(OWNER);
    expect(text).not.toContain(API_KEY);

    const down = fakeClient({ broken: "service_ops_alert_email_target" });
    const unavailable = await handleOpsAlertEmailRequest(request(), {
      environment,
      client: down.client,
      fetchImpl: provider().fetchImpl,
    });
    expect(unavailable.status).toBe(503);

    const unreachable = await handleOpsAlertEmailRequest(request(), {
      environment,
      client,
      fetchImpl: (() => Promise.reject(new Error("offline"))) as unknown as typeof fetch,
    });
    expect(unreachable.status).toBe(502);
    expect(await unreachable.json()).toEqual({ error: "provider_unreachable" });
  });
});
