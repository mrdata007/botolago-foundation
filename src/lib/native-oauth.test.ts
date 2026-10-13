import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";

import {
  APP_URL_SCHEME,
  HANDLED_APP_URL_KEY,
  NATIVE_OAUTH_REDIRECT,
  PENDING_OAUTH_MAX_AGE_MS,
  base64Url,
  buildAuthorizeUrl,
  buildTokenRequest,
  callbackFailure,
  callbackLanding,
  claimAppUrl,
  createPkcePair,
  nativeOAuthAvailable,
  parseAppUrl,
  parsePending,
  parseTokenResponse,
  serializePending,
} from "./native-oauth";

const SUPABASE = "https://abc.supabase.co";

describe("nativeOAuthAvailable", () => {
  test("never in a browser or on the server", () => {
    expect(nativeOAuthAvailable({})).toBe(false);
    expect(nativeOAuthAvailable({ Capacitor: { PluginHeaders: [{ name: "Browser" }] } })).toBe(
      false,
    );
  });

  test("inside the app only when the build has the Browser plugin", () => {
    const ios = { webkit: { messageHandlers: { bridge: {} } } };
    expect(nativeOAuthAvailable(ios)).toBe(false);
    expect(nativeOAuthAvailable({ ...ios, Capacitor: { PluginHeaders: [{ name: "App" }] } })).toBe(
      false,
    );
    expect(
      nativeOAuthAvailable({
        ...ios,
        Capacitor: { PluginHeaders: [{ name: "App" }, { name: "Browser" }] },
      }),
    ).toBe(true);
    expect(
      nativeOAuthAvailable({
        androidBridge: {},
        Capacitor: { PluginHeaders: [{ name: "Browser" }] },
      }),
    ).toBe(true);
  });
});

describe("createPkcePair", () => {
  test("an RFC 7636 verifier and its S256 challenge", async () => {
    const { verifier, challenge } = await createPkcePair();
    expect(verifier).toMatch(/^[A-Za-z0-9\-._~]{64}$/);
    const expected = createHash("sha256").update(verifier).digest("base64url");
    expect(challenge).toBe(expected);
  });

  test("a new pair every time", async () => {
    const a = await createPkcePair();
    const b = await createPkcePair();
    expect(a.verifier).not.toBe(b.verifier);
  });

  test("skips the bytes that would make some characters likelier", async () => {
    let call = 0;
    const pair = await createPkcePair({
      // First draw: only bytes that must be skipped (>= 198); then all zeros.
      getRandomValues: (array) => array.fill(call++ === 0 ? 250 : 0),
      digest: async (data) => createHash("sha256").update(data).digest().buffer as ArrayBuffer,
    });
    expect(pair.verifier).toBe("A".repeat(64));
  });

  test("base64url has no padding and no + or /", () => {
    expect(base64Url(new Uint8Array([251, 255, 191]))).toBe("-_-_");
    expect(base64Url(new Uint8Array([1]))).toBe("AQ");
  });
});

describe("buildAuthorizeUrl", () => {
  test("Supabase's authorize address with the app's return address and the challenge", () => {
    const url = new URL(
      buildAuthorizeUrl({
        supabaseUrl: `${SUPABASE}/`,
        provider: "google",
        redirectTo: NATIVE_OAUTH_REDIRECT,
        codeChallenge: "abc_-",
      }),
    );
    expect(`${url.origin}${url.pathname}`).toBe(`${SUPABASE}/auth/v1/authorize`);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      provider: "google",
      redirect_to: "botolago://auth/callback",
      code_challenge: "abc_-",
      code_challenge_method: "s256",
    });
  });

  test("refuses a Supabase address that is not https (outside a local stack)", () => {
    expect(() =>
      buildAuthorizeUrl({
        supabaseUrl: "http://abc.supabase.co",
        provider: "apple",
        redirectTo: NATIVE_OAUTH_REDIRECT,
        codeChallenge: "x",
      }),
    ).toThrow();
    expect(
      buildAuthorizeUrl({
        supabaseUrl: "http://127.0.0.1:54321",
        provider: "apple",
        redirectTo: NATIVE_OAUTH_REDIRECT,
        codeChallenge: "x",
      }),
    ).toStartWith("http://127.0.0.1:54321/auth/v1/authorize?provider=apple&");
  });
});

describe("the token exchange", () => {
  test("POSTs the code and the verifier to grant_type=pkce with the publishable key", () => {
    const { url, init } = buildTokenRequest({
      supabaseUrl: SUPABASE,
      publishableKey: "sb_publishable_x",
      code: "the-code",
      verifier: "the-verifier",
    });
    expect(url).toBe(`${SUPABASE}/auth/v1/token?grant_type=pkce`);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).apikey).toBe("sb_publishable_x");
    expect(JSON.parse(init.body as string)).toEqual({
      auth_code: "the-code",
      code_verifier: "the-verifier",
    });
  });

  test("reads the two tokens, and nothing else counts as a session", () => {
    expect(parseTokenResponse({ access_token: "a", refresh_token: "r", user: {} })).toEqual({
      access_token: "a",
      refresh_token: "r",
    });
    expect(parseTokenResponse({ access_token: "a" })).toBeNull();
    expect(parseTokenResponse({ access_token: "", refresh_token: "r" })).toBeNull();
    expect(parseTokenResponse({ error: "invalid_grant" })).toBeNull();
    expect(parseTokenResponse(null)).toBeNull();
    expect(parseTokenResponse("a")).toBeNull();
  });
});

describe("the started sign-in", () => {
  const verifier = "v".repeat(64);
  const now = 1_800_000_000_000;

  test("round-trips, with `next` sanitised both ways", () => {
    const raw = serializePending({ verifier, provider: "apple", next: "/fantasy", createdAt: now });
    expect(parsePending(raw, now + 1000)).toEqual({
      verifier,
      provider: "apple",
      next: "/fantasy",
      createdAt: now,
    });
    const evil = serializePending({
      verifier,
      provider: "google",
      next: "//evil.example",
      createdAt: now,
    });
    expect(parsePending(evil, now)?.next).toBe("/");
    const tampered = JSON.stringify({
      verifier,
      provider: "google",
      next: "/\\evil",
      createdAt: now,
    });
    expect(parsePending(tampered, now)?.next).toBe("/");
  });

  test("is gone once too old, or from the future", () => {
    const raw = serializePending({ verifier, provider: "google", next: "/", createdAt: now });
    expect(parsePending(raw, now + PENDING_OAUTH_MAX_AGE_MS)).not.toBeNull();
    expect(parsePending(raw, now + PENDING_OAUTH_MAX_AGE_MS + 1)).toBeNull();
    expect(parsePending(raw, now - 1)).toBeNull();
  });

  test("anything malformed is no sign-in", () => {
    expect(parsePending(null, now)).toBeNull();
    expect(parsePending("", now)).toBeNull();
    expect(parsePending("{", now)).toBeNull();
    expect(parsePending("[]", now)).toBeNull();
    const base = { verifier, provider: "google", next: "/", createdAt: now };
    expect(parsePending(JSON.stringify({ ...base, verifier: "short" }), now)).toBeNull();
    expect(
      parsePending(JSON.stringify({ ...base, verifier: `${"v".repeat(60)} x` }), now),
    ).toBeNull();
    expect(parsePending(JSON.stringify({ ...base, provider: "github" }), now)).toBeNull();
    expect(parsePending(JSON.stringify({ ...base, createdAt: "now" }), now)).toBeNull();
  });
});

describe("parseAppUrl", () => {
  test("the end of a sign-in: the code", () => {
    expect(parseAppUrl("botolago://auth/callback?code=abc-123")).toEqual({
      kind: "oauth",
      code: "abc-123",
      error: null,
    });
    // A trailing slash, and a code in the fragment, are the same thing.
    expect(parseAppUrl("botolago://auth/callback/#code=xyz")).toEqual({
      kind: "oauth",
      code: "xyz",
      error: null,
    });
  });

  test("the end of a sign-in: the provider's refusal", () => {
    expect(
      parseAppUrl(
        "botolago://auth/callback?error=access_denied&error_description=User%20cancelled",
      ),
    ).toEqual({ kind: "oauth", code: null, error: "User cancelled" });
    expect(parseAppUrl("botolago://auth/callback#error=server_error")).toEqual({
      kind: "oauth",
      code: null,
      error: "server_error",
    });
    expect(parseAppUrl("botolago://auth/callback")).toEqual({
      kind: "oauth",
      code: null,
      error: "no_code",
    });
  });

  test("other botolago:// addresses are not this app's business", () => {
    expect(parseAppUrl("botolago://auth/other?code=x")).toBeNull();
    expect(parseAppUrl("botolago://evil/callback?code=x")).toBeNull();
    expect(parseAppUrl(`${APP_URL_SCHEME}x://auth/callback?code=x`)).toBeNull();
  });

  test("an e-mail link to the site becomes the same path in the web view", () => {
    expect(
      parseAppUrl(
        "https://botolago.com/auth/callback?token_hash=1e5&type=recovery&next=%2Fauth%2Fupdate-password",
      ),
    ).toEqual({
      kind: "site",
      path: "/auth/callback?token_hash=1e5&type=recovery&next=%2Fauth%2Fupdate-password",
    });
    // An old implicit-flow link keeps its fragment.
    expect(
      parseAppUrl("https://botolago.com/auth/callback#access_token=a&refresh_token=r"),
    ).toEqual({ kind: "site", path: "/auth/callback#access_token=a&refresh_token=r" });
  });

  test("only the claimed path, only on the site, only over https", () => {
    expect(parseAppUrl("https://botolago.com/")).toBeNull();
    expect(parseAppUrl("https://botolago.com/fantasy")).toBeNull();
    expect(parseAppUrl("https://botolago.com/auth/callbackx")).toBeNull();
    expect(parseAppUrl("http://botolago.com/auth/callback?code=x")).toBeNull();
    expect(parseAppUrl("https://evil.example/auth/callback?code=x")).toBeNull();
    expect(parseAppUrl("https://botolago.com.evil.example/auth/callback")).toBeNull();
    expect(parseAppUrl("https://botolago.com:8443/auth/callback")).toBeNull();
    expect(parseAppUrl("not a url")).toBeNull();
    expect(parseAppUrl("")).toBeNull();
  });
});

describe("where the web view goes", () => {
  test("after the exchange: the callback page, with a same-site next", () => {
    expect(callbackLanding("/fantasy/transfers")).toBe(
      "/auth/callback?next=%2Ffantasy%2Ftransfers",
    );
    expect(callbackLanding("https://evil.example")).toBe("/auth/callback?next=%2F");
  });

  test("after a failure: the callback page's error", () => {
    const url = new URL(callbackFailure("User cancelled"), "https://botolago.com");
    expect(url.pathname).toBe("/auth/callback");
    expect(url.searchParams.get("error_description")).toBe("User cancelled");
    expect(
      new URL(callbackFailure(""), "https://x.test").searchParams.get("error_description"),
    ).toBe("error");
  });
});

describe("claimAppUrl", () => {
  function storage() {
    const map = new Map<string, string>();
    return {
      map,
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => void map.set(key, value),
    };
  }

  test("once per address, in the page and across the page loads it causes", () => {
    const store = storage();
    expect(claimAppUrl("botolago://auth/callback?code=1", store, new Set())).toBe(true);
    expect(store.map.get(HANDLED_APP_URL_KEY)).toBe("botolago://auth/callback?code=1");
    // The next page load: a new memory, the same session storage (getLaunchUrl again).
    expect(claimAppUrl("botolago://auth/callback?code=1", store, new Set())).toBe(false);
    expect(claimAppUrl("botolago://auth/callback?code=2", store, new Set())).toBe(true);
  });

  test("the event and getLaunchUrl in the same page: handled once", () => {
    const memory = new Set<string>();
    expect(claimAppUrl("https://botolago.com/auth/callback?x=1", null, memory)).toBe(true);
    expect(claimAppUrl("https://botolago.com/auth/callback?x=1", null, memory)).toBe(false);
  });

  test("storage that throws falls back to memory", () => {
    const throwing = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    };
    const memory = new Set<string>();
    expect(claimAppUrl("a", throwing, memory)).toBe(true);
    expect(claimAppUrl("a", throwing, memory)).toBe(false);
  });
});
