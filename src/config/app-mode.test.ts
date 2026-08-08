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
          supabaseProjectId: "demo",
          supabaseUrl: "https://demo.invalid",
        }),
      ),
    ).toBe("demo");
    expect(() =>
      resolveAppMode(input({ appMode: "demo", ...mockModes, newsMode: "supabase" })),
    ).toThrow("VITE_NEWS_DATA_MODE=mock");
  });

  it("rejects real Supabase coordinates from demo artifacts", () => {
    expect(() =>
      resolveAppMode(
        input({
          appMode: "demo",
          ...mockModes,
          supabaseProjectId: "production-project",
        }),
      ),
    ).toThrow("VITE_SUPABASE_PROJECT_ID");
    expect(() =>
      resolveAppMode(
        input({
          appMode: "demo",
          ...mockModes,
          supabaseUrl: "https://production-project.supabase.co",
        }),
      ),
    ).toThrow("VITE_SUPABASE_URL");
  });
});
