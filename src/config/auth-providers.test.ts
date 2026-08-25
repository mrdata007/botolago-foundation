import { describe, expect, it } from "bun:test";
import { resolveSocialAuthProviders } from "./auth-providers";

describe("social auth provider visibility", () => {
  it("fails closed when provider flags are missing or not exact", () => {
    expect(resolveSocialAuthProviders({ demoMode: false })).toEqual({
      google: false,
      apple: false,
    });
    expect(
      resolveSocialAuthProviders({
        google: "TRUE",
        apple: "1",
        demoMode: false,
      }),
    ).toEqual({ google: false, apple: false });
  });

  it("enables only providers explicitly set to true", () => {
    expect(
      resolveSocialAuthProviders({
        google: "true",
        apple: "false",
        demoMode: false,
      }),
    ).toEqual({ google: true, apple: false });
    expect(
      resolveSocialAuthProviders({
        google: "false",
        apple: "true",
        demoMode: false,
      }),
    ).toEqual({ google: false, apple: true });
  });

  it("always suppresses OAuth in isolated demo mode", () => {
    expect(
      resolveSocialAuthProviders({
        google: "true",
        apple: "true",
        demoMode: true,
      }),
    ).toEqual({ google: false, apple: false });
  });
});
