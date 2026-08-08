import { describe, expect, it } from "bun:test";
import { resolveAppMode, type AppModeInput } from "./app-mode";

const mockModes = {
  authMode: "mock",
  footballMode: "mock",
  newsMode: "mock",
  notificationsMode: "mock",
  fantasyMode: "mock",
} as const;

const cloudModes = {
  authMode: "supabase",
  footballMode: "supabase",
  newsMode: "supabase",
  notificationsMode: "supabase",
  fantasyMode: "supabase",
} as const;

const inertDemoCoordinates = {
  supabaseProjectId: "demo",
  supabaseUrl: "https://demo.invalid",
  supabasePublishableKey: "demo-public-placeholder",
} as const;

function input(overrides: Partial<AppModeInput>): AppModeInput {
  return { production: true, ...overrides };
}

describe("app deployment mode", () => {
  it("requires an explicit profile for every production build", () => {
    expect(() => resolveAppMode(input(cloudModes))).toThrow("VITE_APP_MODE");
    expect(resolveAppMode({ production: false })).toBe("development");
  });

  it("keeps live builds cloud-only", () => {
    expect(resolveAppMode(input({ appMode: "live", ...cloudModes }))).toBe("live");
    expect(() =>
      resolveAppMode(input({ appMode: "live", ...cloudModes, fantasyMode: "mock" })),
    ).toThrow("VITE_FANTASY_DATA_MODE=supabase");
  });

  it("allows a compiled demo only when every browser domain is mock", () => {
    expect(
      resolveAppMode(
        input({
          appMode: "demo",
          ...mockModes,
          ...inertDemoCoordinates,
        }),
      ),
    ).toBe("demo");
    expect(() =>
      resolveAppMode(input({ appMode: "demo", ...mockModes, newsMode: "supabase" })),
    ).toThrow("VITE_NEWS_DATA_MODE=mock");
  });

  it("requires exact canonical deployment and data-mode values", () => {
    expect(() =>
      resolveAppMode(input({ appMode: "DEMO", ...mockModes, ...inertDemoCoordinates })),
    ).toThrow("VITE_APP_MODE must be live or demo");
    expect(() =>
      resolveAppMode(
        input({
          appMode: "demo",
          ...mockModes,
          authMode: "MOCK",
          ...inertDemoCoordinates,
        }),
      ),
    ).toThrow("VITE_AUTH_MODE=mock");
  });

  it("requires explicit inert Supabase placeholders in demo artifacts", () => {
    expect(() =>
      resolveAppMode(
        input({
          appMode: "demo",
          ...mockModes,
          supabaseUrl: inertDemoCoordinates.supabaseUrl,
          supabasePublishableKey: inertDemoCoordinates.supabasePublishableKey,
        }),
      ),
    ).toThrow("VITE_SUPABASE_PROJECT_ID");
    expect(() =>
      resolveAppMode(
        input({
          appMode: "demo",
          ...mockModes,
          supabaseProjectId: inertDemoCoordinates.supabaseProjectId,
          supabasePublishableKey: inertDemoCoordinates.supabasePublishableKey,
        }),
      ),
    ).toThrow("VITE_SUPABASE_URL");
    expect(() =>
      resolveAppMode(
        input({
          appMode: "demo",
          ...mockModes,
          supabaseProjectId: inertDemoCoordinates.supabaseProjectId,
          supabaseUrl: inertDemoCoordinates.supabaseUrl,
        }),
      ),
    ).toThrow("VITE_SUPABASE_PUBLISHABLE_KEY");
  });

  it("rejects real Supabase coordinates from demo artifacts", () => {
    expect(() =>
      resolveAppMode(
        input({
          appMode: "demo",
          ...mockModes,
          ...inertDemoCoordinates,
          supabaseProjectId: "production-project",
        }),
      ),
    ).toThrow("VITE_SUPABASE_PROJECT_ID");
    expect(() =>
      resolveAppMode(
        input({
          appMode: "demo",
          ...mockModes,
          ...inertDemoCoordinates,
          supabaseUrl: "https://production-project.supabase.co",
        }),
      ),
    ).toThrow("VITE_SUPABASE_URL");
  });
});
