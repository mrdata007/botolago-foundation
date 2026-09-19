import { describe, expect, it } from "bun:test";
import { MfaError, mapMfaError } from "./mfa-errors";

describe("mapMfaError", () => {
  it("passes an existing MfaError through unchanged", () => {
    const original = new MfaError("invalid_code", "nope");
    expect(mapMfaError(original)).toBe(original);
  });

  it("classifies a 429 status as rate_limited and retryable", () => {
    const mapped = mapMfaError({ status: 429, message: "Too many requests" });
    expect(mapped.code).toBe("rate_limited");
    expect(mapped.retryable).toBe(true);
  });

  it("classifies an invalid TOTP code message as invalid_code", () => {
    const mapped = mapMfaError({ message: "Invalid TOTP code entered" });
    expect(mapped.code).toBe("invalid_code");
  });

  it("classifies an expired challenge message as challenge_expired and retryable", () => {
    const mapped = mapMfaError({ message: "MFA challenge has expired" });
    expect(mapped.code).toBe("challenge_expired");
    expect(mapped.retryable).toBe(true);
  });

  it("classifies a 401 as unauthorized", () => {
    const mapped = mapMfaError({ status: 401, message: "not authenticated" });
    expect(mapped.code).toBe("unauthorized");
  });

  it("classifies a network failure message as network and retryable", () => {
    const mapped = mapMfaError({ message: "Failed to fetch" });
    expect(mapped.code).toBe("network");
    expect(mapped.retryable).toBe(true);
  });

  it("falls back to internal for anything unrecognized", () => {
    const mapped = mapMfaError({ message: "something bizarre happened" });
    expect(mapped.code).toBe("internal");
  });

  it("falls back to internal for a null/undefined error", () => {
    expect(mapMfaError(null).code).toBe("internal");
    expect(mapMfaError(undefined).code).toBe("internal");
  });
});
