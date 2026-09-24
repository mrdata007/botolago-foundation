import { describe, expect, test } from "bun:test";

import { createSupabaseFetch, REST_REQUEST_TIMEOUT_MS } from "./client";

const key = "sb_publishable_test";

function recorder() {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

describe("the Supabase fetch wrapper", () => {
  test("gives every data request a deadline above the database's own limits", async () => {
    expect(REST_REQUEST_TIMEOUT_MS).toBeGreaterThan(8_000);
    const { calls, fetchImpl } = recorder();
    await createSupabaseFetch(key, { fetchImpl })("https://x.supabase.co/rest/v1/rpc/news_feed", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
    });
    const init = calls[0].init;
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    const headers = new Headers(init?.headers);
    expect(headers.get("apikey")).toBe(key);
    // A new-style key is not a bearer token.
    expect(headers.get("Authorization")).toBeNull();
  });

  test("a request that hangs is abandoned at the deadline", async () => {
    const hanging = ((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      })) as typeof fetch;
    const started = performance.now();
    const outcome = await createSupabaseFetch(key, { fetchImpl: hanging, timeoutMs: 30 })(
      "https://x.supabase.co/rest/v1/rpc/football_matches_by_date",
      { method: "POST" },
    ).catch((error: unknown) => error);
    expect((outcome as Error).name).toBe("TimeoutError");
    expect(performance.now() - started).toBeLessThan(2_000);
  });

  test("the caller's own cancellation still works", async () => {
    const hanging = ((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      })) as typeof fetch;
    const controller = new AbortController();
    const pending = createSupabaseFetch(key, { fetchImpl: hanging })(
      "https://x.supabase.co/rest/v1/rpc/news_feed",
      { method: "POST", signal: controller.signal },
    ).catch((error: unknown) => error);
    controller.abort();
    expect(((await pending) as Error).name).toBe("AbortError");
  });

  test("sign-in and sign-up are not cut short", async () => {
    const { calls, fetchImpl } = recorder();
    await createSupabaseFetch(key, { fetchImpl })("https://x.supabase.co/auth/v1/signup", {
      method: "POST",
    });
    expect(calls[0].init?.signal).toBeUndefined();
  });
});
