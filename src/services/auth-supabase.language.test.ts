import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import type { Session, SupabaseClient, User } from "@supabase/supabase-js";

import type { CompleteOnboardingInput, ProfileDto } from "@/backend/identity/contracts";
import { SupabaseAuthService } from "./auth-supabase";

// Owner decision, 2026-10-15: an account's notification language is French
// unless the person chose another in the profile editor, and a save that is
// not about the language leaves the stored one alone. The database column and
// the sign-up trigger already default to French; these pin what the CLIENT
// sends, driving the real service with a fake Supabase Auth and profile
// repository injected through its constructor.

type AuthClient = SupabaseClient["auth"];

const ACCOUNT = "10000000-0000-4000-8000-0000000000aa";

const scope = globalThis as { window?: unknown };
let savedWindow: unknown;
beforeAll(() => {
  savedWindow = scope.window;
  const store = new Map<string, string>();
  scope.window = {
    location: { origin: "https://app.example.test" },
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    },
    dispatchEvent: () => true,
  };
});
afterAll(() => {
  scope.window = savedWindow;
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function profileOf(preferredLanguage: "fr" | "ar"): ProfileDto {
  return {
    id: ACCOUNT,
    username: "fan",
    displayName: "Fan",
    avatarPath: null,
    preferredLanguage,
    favoriteTeamId: null,
    favoriteTeamReference: null,
    onboardingCompletedAt: "2026-09-02T00:00:00Z",
    createdAt: "2026-09-01T00:00:00Z",
    updatedAt: "2026-09-02T00:00:00Z",
    notifications: { matchAlerts: true, breakingNews: true, fantasyDeadlines: true },
  };
}

function token(): string {
  const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${part({ alg: "HS256", typ: "JWT" })}.${part({ sub: ACCOUNT, aal: "aal1" })}.c2ln`;
}

const session = {
  user: {
    id: ACCOUNT,
    email: "fan@example.test",
    app_metadata: { provider: "email" },
    user_metadata: {},
    aud: "authenticated",
    created_at: "2026-09-01T00:00:00Z",
    email_confirmed_at: "2026-09-01T00:00:00Z",
  } as User,
  access_token: token(),
  refresh_token: "r",
} as Session;

describe("sign-up sends a notification language only when the person chose one", () => {
  async function signUpWith(language?: "fr" | "ar") {
    let metadata: Record<string, unknown> | undefined;
    const service = new SupabaseAuthService({
      auth: () =>
        ({
          signUp: async (credentials: { options?: { data?: Record<string, unknown> } }) => {
            metadata = credentials.options?.data;
            return { data: { user: { email: "fan@example.test" } }, error: null };
          },
        }) as unknown as AuthClient,
    });
    const result = await service.registerWithEmail({
      fullName: "Fan Test",
      username: "fantest",
      email: "fan@example.test",
      password: "SuperSecret1!",
      ...(language ? { language } : {}),
    });
    expect(result.ok).toBe(true);
    return metadata ?? {};
  }

  it("sends none when the form made no choice, so the database default (French) applies", async () => {
    const metadata = await signUpWith();
    expect(metadata).not.toHaveProperty("preferred_language");
    expect(metadata.username).toBe("fantest");
  });

  it("sends the language when the person did choose one", async () => {
    expect((await signUpWith("ar")).preferred_language).toBe("ar");
    expect((await signUpWith("fr")).preferred_language).toBe("fr");
  });
});

describe("saving the profile does not overwrite the stored notification language", () => {
  async function saveWith(stored: "fr" | "ar", input: { language?: "fr" | "ar" }) {
    const saved: CompleteOnboardingInput[] = [];
    const service = new SupabaseAuthService({
      auth: () =>
        ({
          getSession: async () => ({ data: { session }, error: null }),
          onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
          mfa: {
            getAuthenticatorAssuranceLevel: async () => ({
              data: { currentLevel: "aal1", nextLevel: "aal1" },
              error: null,
            }),
          },
        }) as unknown as AuthClient,
      profiles: {
        getMe: async () => profileOf(stored),
        completeOnboarding: async (profile: CompleteOnboardingInput) => {
          saved.push(profile);
          return profileOf(profile.preferredLanguage);
        },
      },
    });
    service.subscribeToSession(() => undefined);
    await settle();
    expect(service.getSession().user?.language).toBe(stored);
    const result = await service.completeProfile({ username: "fan", ...input });
    expect(result.ok).toBe(true);
    return saved[0]!.preferredLanguage;
  }

  it("an account stored as Arabic stays Arabic when the save says nothing about language", async () => {
    expect(await saveWith("ar", {})).toBe("ar");
  });

  it("an account stored as French stays French when the save says nothing about language", async () => {
    expect(await saveWith("fr", {})).toBe("fr");
  });

  it("an explicit choice is saved", async () => {
    expect(await saveWith("fr", { language: "ar" })).toBe("ar");
    expect(await saveWith("ar", { language: "fr" })).toBe("fr");
  });
});
