import { describe, expect, it } from "bun:test";
import { resolveSocialAuthProviders } from "./auth-providers";

describe("social auth provider visibility", () => {
  it("fails closed when auth is not Supabase", () => {
    expect(resolveSocialAuthProviders({})).toEqual({
      google: false,
      apple: false,
    });
    expect(
      resolveSocialAuthProviders({
        authMode: "mock",
        google: "true",
        apple: "true",
      }),
    ).toEqual({ google: false, apple: false });
  });

  it("fails closed when provider flags are missing or not exact", () => {
    expect(resolveSocialAuthProviders({ authMode: "supabase" })).toEqual({
      google: false,
      apple: false,
    });
    expect(
      resolveSocialAuthProviders({
        authMode: "supabase",
        google: "TRUE",
        apple: "1",
      }),
    ).toEqual({ google: false, apple: false });
  });

  it("enables only exact provider flags in stable order", () => {
    expect(
      resolveSocialAuthProviders({
        authMode: "supabase",
        google: "true",
        apple: "false",
      }),
    ).toEqual({ google: true, apple: false });
    expect(
      resolveSocialAuthProviders({
        authMode: "supabase",
        google: "false",
        apple: "true",
      }),
    ).toEqual({ google: false, apple: true });
    expect(
      resolveSocialAuthProviders({
        authMode: "supabase",
        google: "true",
        apple: "true",
      }),
    ).toEqual({ google: true, apple: true });
  });
});
