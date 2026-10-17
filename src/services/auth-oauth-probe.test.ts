// The pre-check of a Google / Apple sign-in address (sweep case A8).
// Run with: `bun test src/services/auth-oauth-probe.test.ts`
import { describe, expect, test } from "bun:test";

import { isProviderOffReason } from "@/lib/auth-callback";
import {
  classifyAuthorizeAnswer,
  probeOAuthAuthorizeUrl,
  type ProbeFetch,
  type ProbeResponse,
} from "./auth-oauth-probe";

const URL_UNDER_TEST = "https://project.example.test/auth/v1/authorize?provider=google";

/** What Supabase answers when the provider is switched off (seen in the sweep). */
const PROVIDER_OFF_BODY = {
  code: 400,
  error_code: "validation_failed",
  msg: "Unsupported provider: provider is not enabled",
};

function answer(status: number, body: unknown, extra: Partial<ProbeResponse> = {}): ProbeFetch {
  return async () => ({
    status,
    ok: status >= 200 && status < 300,
    json: async () => {
      if (body === undefined) throw new SyntaxError("Unexpected token < in JSON");
      return body;
    },
    ...extra,
  });
}

describe("classifyAuthorizeAnswer", () => {
  test("a provider that is switched off is the friendly 'unavailable' error", () => {
    expect(classifyAuthorizeAnswer(400, PROVIDER_OFF_BODY)).toBe("provider_unavailable");
    expect(classifyAuthorizeAnswer(400, { error_code: "provider_disabled", msg: "x" })).toBe(
      "provider_unavailable",
    );
    expect(
      classifyAuthorizeAnswer(400, { msg: "Unsupported provider: provider is not enabled" }),
    ).toBe("provider_unavailable");
    expect(classifyAuthorizeAnswer(422, { message: "provider is not enabled" })).toBe(
      "provider_unavailable",
    );
  });

  test("a validation failure that is not about the provider stays generic", () => {
    expect(
      classifyAuthorizeAnswer(400, { error_code: "validation_failed", msg: "bad redirect" }),
    ).toBe("generic");
  });

  test("a rate limit, a gateway failure and anything else", () => {
    expect(classifyAuthorizeAnswer(429, { msg: "slow down" })).toBe("rate_limited");
    for (const status of [502, 503, 504, 520, 524, 530]) {
      expect(classifyAuthorizeAnswer(status, null)).toBe("network");
    }
    expect(classifyAuthorizeAnswer(500, {})).toBe("generic");
    expect(classifyAuthorizeAnswer(404, "not json at all")).toBe("generic");
  });
});

describe("isProviderOffReason", () => {
  test("reads the code and the wording, either alone", () => {
    expect(isProviderOffReason("provider_disabled", undefined)).toBe(true);
    expect(isProviderOffReason(undefined, "Unsupported provider: provider is not enabled")).toBe(
      true,
    );
    expect(isProviderOffReason("VALIDATION_FAILED", "Provider is not ready")).toBe(true);
    expect(isProviderOffReason("validation_failed", "Email is invalid")).toBe(false);
    expect(isProviderOffReason("access_denied", "The user denied access")).toBe(false);
    expect(isProviderOffReason(undefined, undefined)).toBe(false);
  });
});

describe("probeOAuthAuthorizeUrl", () => {
  const online = () => true;

  test("a redirect to the provider is the go-ahead (opaque in a browser, 3xx elsewhere)", async () => {
    expect(
      await probeOAuthAuthorizeUrl(URL_UNDER_TEST, {
        online,
        fetch: answer(0, undefined, { type: "opaqueredirect", ok: false }),
      }),
    ).toBeNull();
    expect(
      await probeOAuthAuthorizeUrl(URL_UNDER_TEST, { online, fetch: answer(302, undefined) }),
    ).toBeNull();
  });

  test("asks without following the redirect and without cookies", async () => {
    let seen: RequestInit | undefined;
    await probeOAuthAuthorizeUrl(URL_UNDER_TEST, {
      online,
      fetch: async (_url, init) => {
        seen = init;
        return { status: 302, ok: false, json: async () => ({}) };
      },
    });
    expect(seen?.redirect).toBe("manual");
    expect(seen?.credentials).toBe("omit");
    expect(seen?.method).toBe("GET");
  });

  test("a provider that is switched off is reported, not navigated to", async () => {
    expect(
      await probeOAuthAuthorizeUrl(URL_UNDER_TEST, {
        online,
        fetch: answer(400, PROVIDER_OFF_BODY),
      }),
    ).toBe("provider_unavailable");
  });

  test("a rate limit, a gateway page that is not JSON, and a server error", async () => {
    expect(await probeOAuthAuthorizeUrl(URL_UNDER_TEST, { online, fetch: answer(429, {}) })).toBe(
      "rate_limited",
    );
    expect(
      await probeOAuthAuthorizeUrl(URL_UNDER_TEST, { online, fetch: answer(502, undefined) }),
    ).toBe("network");
    expect(await probeOAuthAuthorizeUrl(URL_UNDER_TEST, { online, fetch: answer(500, {}) })).toBe(
      "generic",
    );
  });

  test("an unexpected 200 is left to the browser", async () => {
    expect(
      await probeOAuthAuthorizeUrl(URL_UNDER_TEST, { online, fetch: answer(200, {}) }),
    ).toBeNull();
  });

  test("an answer the page is not allowed to read (CORS) leaves the browser to go ahead, as before", async () => {
    const refused: ProbeFetch = async () => {
      throw new TypeError("Failed to fetch");
    };
    expect(await probeOAuthAuthorizeUrl(URL_UNDER_TEST, { online, fetch: refused })).toBeNull();
  });

  test("a device that says it is offline is told so, before and after the request", async () => {
    let asked = false;
    const never: ProbeFetch = async () => {
      asked = true;
      return { status: 302, ok: false, json: async () => ({}) };
    };
    expect(
      await probeOAuthAuthorizeUrl(URL_UNDER_TEST, { online: () => false, fetch: never }),
    ).toBe("network");
    expect(asked).toBe(false);

    let calls = 0;
    const dropsMidway: ProbeFetch = async () => {
      throw new TypeError("Failed to fetch");
    };
    const flips = () => ++calls <= 1;
    expect(
      await probeOAuthAuthorizeUrl(URL_UNDER_TEST, { online: flips, fetch: dropsMidway }),
    ).toBe("network");
  });

  test("a check that takes too long is abandoned and the browser goes ahead", async () => {
    const hangs: ProbeFetch = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () =>
          reject(new DOMException("aborted", "AbortError")),
        );
      });
    expect(
      await probeOAuthAuthorizeUrl(URL_UNDER_TEST, { online, fetch: hangs, timeoutMs: 20 }),
    ).toBeNull();
  });
});
