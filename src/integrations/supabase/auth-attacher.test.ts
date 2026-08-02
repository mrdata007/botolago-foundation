import { describe, expect, it } from "bun:test";
import { hasBrowserSupabaseConfig } from "./auth-attacher";

describe("Supabase server-function auth attachment", () => {
  it("does not initialize Supabase in deterministic local mock mode", () => {
    expect(hasBrowserSupabaseConfig({})).toBe(false);
    expect(hasBrowserSupabaseConfig({ VITE_SUPABASE_URL: "https://example.supabase.co" })).toBe(
      false,
    );
  });

  it("attaches only when both public browser values are configured", () => {
    expect(
      hasBrowserSupabaseConfig({
        VITE_SUPABASE_URL: "https://example.supabase.co",
        VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
      }),
    ).toBe(true);
  });
});
