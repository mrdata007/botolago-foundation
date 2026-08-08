// AuthService selector.
//
// Selects between the production Supabase-backed implementation and the local
// mock. Default is Supabase whenever the Supabase env values are present.
// Mock mode is explicit (VITE_AUTH_MODE=mock) and only useful for deterministic
// unit tests. Never silently fall back from Supabase to mock on runtime errors.

import type { AuthService } from "./auth-types";
import { IS_DEMO_MODE } from "@/config/app-mode";
import {
  LocalMockAuthService,
  MOCK_DEMO_EMAIL,
  MOCK_DEMO_PASSWORD,
  MOCK_DEMO_CODE,
} from "./auth-mock";
import { SupabaseAuthService } from "./auth-supabase";

export * from "./auth-types";

type Mode = "supabase" | "mock";

export function selectAuthMode(
  configuredMode: string | undefined,
  hasSupabase: boolean,
  production: boolean,
  demoMode = IS_DEMO_MODE,
): Mode {
  const explicit = configuredMode?.toLowerCase();
  if (demoMode && explicit !== "mock") {
    throw new Error("Demo Auth requires VITE_AUTH_MODE=mock.");
  }
  if (production && !demoMode && explicit !== "supabase") {
    throw new Error("Production Auth requires VITE_AUTH_MODE=supabase.");
  }
  if (explicit === "mock") return "mock";
  if (explicit === "supabase") return "supabase";
  return hasSupabase ? "supabase" : "mock";
}

function detectMode(): Mode {
  return selectAuthMode(
    import.meta.env.VITE_AUTH_MODE as string | undefined,
    !!import.meta.env.VITE_SUPABASE_URL && !!import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    import.meta.env.PROD,
  );
}

export const AUTH_MODE: Mode = detectMode();
export const IS_MOCK_AUTH = AUTH_MODE === "mock";

function createService(): AuthService {
  return AUTH_MODE === "mock" ? new LocalMockAuthService() : new SupabaseAuthService();
}

export const authService: AuthService = createService();

// Exposed for tests only. Only the mock exposes __reset.
export const __testing = {
  DEMO_EMAIL: MOCK_DEMO_EMAIL,
  DEMO_PASSWORD: MOCK_DEMO_PASSWORD,
  DEMO_CODE: MOCK_DEMO_CODE,
  createMockService: () => new LocalMockAuthService(),
  isMock: () => AUTH_MODE === "mock",
  reset() {
    if (AUTH_MODE !== "mock") return;
    (authService as LocalMockAuthService).__reset();
  },
};
