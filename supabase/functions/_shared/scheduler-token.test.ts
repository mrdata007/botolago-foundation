import { describe, expect, it } from "bun:test";
import { handleAccountDeletionRequest } from "./account-deletion-worker.ts";
import { handleAiContentRequest } from "./ai-content.ts";
import { handleFootballLiveRefreshRequest } from "./football-live-refresh.ts";
import { handleEmailDispatchRequest } from "./notification-email-dispatch.ts";
import { handlePushDispatchRequest } from "./notification-push-dispatch.ts";
import { handleOpsAlertEmailRequest } from "./ops-alert-email.ts";
import { checkSchedulerToken, SCHEDULER_TOKEN_HEADER } from "./scheduler-token.ts";

const TOKEN = "e".repeat(64);
const CONFIGURED = { BOTOLAGO_SCHEDULER_TOKEN: TOKEN };

function request(token: string | null): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token !== null) headers[SCHEDULER_TOKEN_HEADER] = token;
  return new Request("https://functions.test/", { method: "POST", headers, body: "{}" });
}

// A service-role client that records every touch: any property read, at any
// depth, counts as reaching for a privileged operation.
function trap(): { client: never; touched: string[] } {
  const touched: string[] = [];
  const node = (path: string): unknown =>
    new Proxy(() => undefined, {
      get(_target, key) {
        if (key === "then") return undefined;
        touched.push(`${path}.${String(key)}`);
        return node(`${path}.${String(key)}`);
      },
      apply() {
        touched.push(`${path}()`);
        return node(`${path}()`);
      },
    });
  return { client: node("client") as never, touched };
}

const neverFetch = (async () => {
  throw new Error("no outbound call may happen before the token is accepted");
}) as typeof fetch;

type Handler = (
  request: Request,
  environment: Record<string, string>,
  client: never,
) => Promise<Response>;

const HANDLERS: Record<string, Handler> = {
  "account-deletion-worker": (r, environment, client) =>
    handleAccountDeletionRequest(r, {
      environment,
      client,
      avatars: client,
      fetchImpl: neverFetch,
    }),
  "ai-content-generate": (r, environment, client) =>
    handleAiContentRequest(r, { environment, client, fetchImpl: neverFetch }),
  "football-live-refresh": (r, environment, client) =>
    handleFootballLiveRefreshRequest(r, { environment, client, fetch: neverFetch }),
  "notification-email-dispatch": (r, environment, client) =>
    handleEmailDispatchRequest(r, { environment, client, fetch: neverFetch } as never),
  "notification-push-dispatch": (r, environment, client) =>
    handlePushDispatchRequest(r, { environment, client, providers: client }),
  "ops-alert-email": (r, environment, client) =>
    handleOpsAlertEmailRequest(r, { environment, client, fetchImpl: neverFetch }),
};

describe("scheduled functions refuse before any privileged operation", () => {
  const refused: [string, string | null, Record<string, string>, number][] = [
    ["no token", null, CONFIGURED, 401],
    ["empty token", "", CONFIGURED, 401],
    ["malformed token", "not-a-token", CONFIGURED, 401],
    ["upper-case token", "E".repeat(64), CONFIGURED, 401],
    ["well-formed wrong token", "9".repeat(64), CONFIGURED, 401],
    ["the right token with an extra character", `${TOKEN}0`, CONFIGURED, 401],
    ["no secret configured", TOKEN, {}, 503],
    ["a malformed secret configured", TOKEN, { BOTOLAGO_SCHEDULER_TOKEN: "short" }, 503],
  ];

  for (const [name, handle] of Object.entries(HANDLERS)) {
    for (const [label, token, environment, status] of refused) {
      it(`${name}: ${label} → ${status}, client untouched`, async () => {
        const { client, touched } = trap();
        const response = await handle(request(token), environment, client);
        expect(response.status).toBe(status);
        expect(touched).toEqual([]);
      });
    }
  }
});

describe("checkSchedulerToken", () => {
  it("accepts only the configured token", () => {
    expect(checkSchedulerToken(request(TOKEN), CONFIGURED)).toBe("accepted");
    expect(checkSchedulerToken(request(TOKEN), { BOTOLAGO_SCHEDULER_TOKEN: ` ${TOKEN}\n` })).toBe(
      "accepted",
    );
    expect(checkSchedulerToken(request("9".repeat(64)), CONFIGURED)).toBe("unauthorized");
    expect(checkSchedulerToken(request(null), CONFIGURED)).toBe("unauthorized");
  });

  it("fails closed when the secret is missing or malformed", () => {
    expect(checkSchedulerToken(request(TOKEN), {})).toBe("not_configured");
    expect(checkSchedulerToken(request(""), { BOTOLAGO_SCHEDULER_TOKEN: "" })).toBe(
      "not_configured",
    );
    expect(checkSchedulerToken(request(TOKEN), { BOTOLAGO_SCHEDULER_TOKEN: "x".repeat(64) })).toBe(
      "not_configured",
    );
  });
});
