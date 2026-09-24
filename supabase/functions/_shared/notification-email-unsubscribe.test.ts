import { describe, expect, it } from "bun:test";
import {
  handleEmailUnsubscribeRequest,
  type UnsubscribeRpcClient,
} from "./notification-email-unsubscribe.ts";

const TOKEN = "Ab3_-".padEnd(32, "x");
const ENDPOINT = "https://project.supabase.co/functions/v1/notification-email-unsubscribe";

function client(reply: { data: unknown; error: { message: string } | null } | Error) {
  const calls: Array<{ name: string; args: Record<string, unknown> | undefined }> = [];
  const rpcClient: UnsubscribeRpcClient = {
    schema() {
      return {
        rpc(name: string, args?: Record<string, unknown>) {
          calls.push({ name, args });
          if (reply instanceof Error) return Promise.reject(reply);
          return Promise.resolve(reply);
        },
      };
    },
  };
  return { rpcClient, calls };
}

function post(token: string | null, body = "List-Unsubscribe=One-Click"): Request {
  const url = token === null ? ENDPOINT : `${ENDPOINT}?token=${encodeURIComponent(token)}`;
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
}

describe("one-click unsubscribe", () => {
  it("unsubscribes on the mail provider's POST", async () => {
    const { rpcClient, calls } = client({ data: { status: "unsubscribed" }, error: null });
    const response = await handleEmailUnsubscribeRequest(post(TOKEN), {
      environment: {},
      client: rpcClient,
    });
    expect(response.status).toBe(200);
    expect(calls).toEqual([{ name: "unsubscribe_notification_email", args: { p_token: TOKEN } }]);
    expect(await response.text()).not.toContain(TOKEN);
  });

  it("answers 200 when the account was already unsubscribed", async () => {
    const { rpcClient } = client({ data: { status: "already_unsubscribed" }, error: null });
    const response = await handleEmailUnsubscribeRequest(post(TOKEN), {
      environment: {},
      client: rpcClient,
    });
    expect(response.status).toBe(200);
  });

  it("refuses a missing, malformed or unknown token without guessing", async () => {
    const { rpcClient, calls } = client({ data: { status: "invalid" }, error: null });
    for (const token of [null, "short", "x".repeat(33), "bad token with spaces aaaaaaaaaa"]) {
      const response = await handleEmailUnsubscribeRequest(post(token), {
        environment: {},
        client: rpcClient,
      });
      expect(response.status).toBe(400);
    }
    expect(calls).toHaveLength(0);
    const unknown = await handleEmailUnsubscribeRequest(post(TOKEN), {
      environment: {},
      client: rpcClient,
    });
    expect(unknown.status).toBe(400);
  });

  it("asks the provider to try again when the database is unavailable", async () => {
    for (const reply of [{ data: null, error: { message: "down" } }, new Error("network")]) {
      const { rpcClient } = client(reply);
      const response = await handleEmailUnsubscribeRequest(post(TOKEN), {
        environment: {},
        client: rpcClient,
      });
      expect(response.status).toBe(503);
    }
  });

  it("sends a browser GET to the confirmation page instead of unsubscribing", async () => {
    const { rpcClient, calls } = client({ data: { status: "unsubscribed" }, error: null });
    const response = await handleEmailUnsubscribeRequest(
      new Request(`${ENDPOINT}?token=${TOKEN}`, { method: "GET" }),
      { environment: { APP_URL: "https://botolago.com" }, client: rpcClient },
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      `https://botolago.com/unsubscribe?token=${TOKEN}`,
    );
    expect(calls).toHaveLength(0);
  });

  it("never redirects anywhere but the app's own origin", async () => {
    const { rpcClient } = client({ data: null, error: null });
    for (const appUrl of ["javascript:alert(1)", "http://evil.example", "https://botolago.com/x"]) {
      const response = await handleEmailUnsubscribeRequest(
        new Request(`${ENDPOINT}?token=nope`, { method: "GET" }),
        { environment: { APP_URL: appUrl }, client: rpcClient },
      );
      expect(response.headers.get("location")).toBe("https://botolago.com/unsubscribe");
    }
  });

  it("rejects other methods and oversized bodies", async () => {
    const { rpcClient } = client({ data: { status: "unsubscribed" }, error: null });
    const put = await handleEmailUnsubscribeRequest(
      new Request(`${ENDPOINT}?token=${TOKEN}`, { method: "PUT" }),
      { environment: {}, client: rpcClient },
    );
    expect(put.status).toBe(405);
    const big = await handleEmailUnsubscribeRequest(
      new Request(`${ENDPOINT}?token=${TOKEN}`, {
        method: "POST",
        headers: { "content-length": "5000" },
        body: "x".repeat(5000),
      }),
      { environment: {}, client: rpcClient },
    );
    expect(big.status).toBe(413);
  });
});
