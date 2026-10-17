// Google / Apple sign-in must not send the visitor to a raw Supabase error page
// when the provider is switched off (sweep case A8). The service asks the
// authorize address first and only follows a go-ahead.
// Run with: `bun test src/services/auth-supabase.oauth.test.ts`
import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { SupabaseAuthService } from "./auth-supabase";
import type { AuthErrorCode } from "./auth-types";

const scope = globalThis as { window?: unknown };
let savedWindow: unknown;
beforeAll(() => {
  savedWindow = scope.window;
  scope.window = { location: { origin: "https://app.example.test" } };
});
afterAll(() => {
  scope.window = savedWindow;
});

const AUTHORIZE = "https://project.example.test/auth/v1/authorize?provider=google";

function build(options: {
  data?: { url: string | null } | null;
  error?: unknown;
  probe: (url: string) => Promise<AuthErrorCode | null>;
}) {
  const asked: Array<Record<string, unknown>> = [];
  const visited: string[] = [];
  const service = new SupabaseAuthService({
    auth: () =>
      ({
        signInWithOAuth: async (credentials: Record<string, unknown>) => {
          asked.push(credentials);
          return {
            data: options.data === undefined ? { url: AUTHORIZE } : options.data,
            error: options.error ?? null,
          };
        },
      }) as never,
    probeOAuth: options.probe,
    goTo: (url) => visited.push(url),
  });
  return { service, asked, visited };
}

describe("social sign-in", () => {
  test("asks for the address without navigating, then follows a go-ahead", async () => {
    const { service, asked, visited } = build({ probe: async () => null });
    expect(await service.signInWithGoogle("/fantasy")).toEqual({ ok: true });
    expect(asked).toHaveLength(1);
    expect(asked[0]!.provider).toBe("google");
    const options = asked[0]!.options as { redirectTo: string; skipBrowserRedirect: boolean };
    expect(options.skipBrowserRedirect).toBe(true);
    expect(options.redirectTo).toBe("https://app.example.test/auth/callback?next=%2Ffantasy");
    expect(visited).toEqual([AUTHORIZE]);
  });

  test("Apple goes the same way", async () => {
    const { service, asked, visited } = build({ probe: async () => null });
    expect(await service.signInWithApple()).toEqual({ ok: true });
    expect(asked[0]!.provider).toBe("apple");
    expect(visited).toHaveLength(1);
  });

  test("a provider that is switched off keeps the visitor in the app", async () => {
    let probed: string | undefined;
    const { service, visited } = build({
      probe: async (url) => {
        probed = url;
        return "provider_unavailable";
      },
    });
    expect(await service.signInWithGoogle()).toEqual({
      ok: false,
      errorCode: "provider_unavailable",
    });
    expect(probed).toBe(AUTHORIZE);
    expect(visited).toEqual([]);
  });

  test("a lost connection or a rate limit is reported the same way", async () => {
    for (const code of ["network", "rate_limited"] as const) {
      const { service, visited } = build({ probe: async () => code });
      expect(await service.signInWithApple()).toEqual({ ok: false, errorCode: code });
      expect(visited).toEqual([]);
    }
  });

  test("an error from the client itself is mapped as before and nothing is asked", async () => {
    let probed = false;
    const { service, visited } = build({
      data: null,
      error: { name: "AuthApiError", message: "Provider is not enabled", status: 400 },
      probe: async () => {
        probed = true;
        return null;
      },
    });
    expect(await service.signInWithGoogle()).toEqual({
      ok: false,
      errorCode: "provider_unavailable",
    });
    expect(probed).toBe(false);
    expect(visited).toEqual([]);
  });

  test("no address from the client is a failure, not a navigation", async () => {
    const { service, visited } = build({ data: { url: null }, probe: async () => null });
    expect(await service.signInWithGoogle()).toEqual({ ok: false, errorCode: "generic" });
    expect(visited).toEqual([]);
  });
});
