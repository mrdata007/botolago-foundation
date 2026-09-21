import { describe, expect, it } from "bun:test";
import {
  enrollTotpFactor,
  getAssuranceLevels,
  isAal2,
  listVerifiedTotpFactors,
  requiresLoginChallenge,
  toQrDataUrl,
  unenrollFactor,
  verifyTotpFactor,
  type MfaAuthClient,
} from "./mfa";
import { MfaError } from "./mfa-errors";

const FACTOR_ID = "33333333-3333-4333-8333-333333333333";
const CHALLENGE_ID = "44444444-4444-4444-8444-444444444444";

function fakeClient(overrides: Partial<MfaAuthClient> = {}): MfaAuthClient {
  return {
    enroll: async () => ({
      data: {
        id: FACTOR_ID,
        type: "totp",
        totp: { qr_code: "<svg>fake-qr</svg>", secret: "FAKESECRET234", uri: "otpauth://totp/x" },
      },
      error: null,
    }),
    challenge: async () => ({ data: { id: CHALLENGE_ID }, error: null }),
    verify: async () => ({ data: { access_token: "fake-jwt" }, error: null }),
    unenroll: async () => ({ data: { id: FACTOR_ID }, error: null }),
    listFactors: async () => ({ data: { totp: [] }, error: null }),
    getAuthenticatorAssuranceLevel: async () => ({
      data: { currentLevel: "aal1", nextLevel: "aal1" },
      error: null,
    }),
    ...overrides,
  };
}

describe("enrollTotpFactor", () => {
  it("returns the QR/secret/uri payload for a fresh TOTP enrollment", async () => {
    const client = fakeClient();
    const enrollment = await enrollTotpFactor(client);
    expect(enrollment).toEqual({
      factorId: FACTOR_ID,
      qrCodeSvg: "<svg>fake-qr</svg>",
      secret: "FAKESECRET234",
      uri: "otpauth://totp/x",
    });
  });

  it("maps an already-enrolled rejection from Supabase", async () => {
    const client = fakeClient({
      enroll: async () => ({
        data: null,
        error: { message: "A factor with this friendly name already exists" },
      }),
    });
    await expect(enrollTotpFactor(client)).rejects.toMatchObject({ code: "already_enrolled" });
  });
});

describe("verifyTotpFactor", () => {
  it("rejects a malformed code before ever calling challenge/verify", async () => {
    let called = false;
    const client = fakeClient({
      challenge: async () => ((called = true), { data: null, error: null }),
    });
    await expect(verifyTotpFactor(client, FACTOR_ID, "12")).rejects.toMatchObject({
      code: "invalid_code",
    });
    expect(called).toBe(false);
  });

  it("runs the official challenge-then-verify flow with the trimmed code", async () => {
    let verifyArgs: unknown;
    const client = fakeClient({
      verify: async (params) => {
        verifyArgs = params;
        return { data: { access_token: "jwt" }, error: null };
      },
    });
    await verifyTotpFactor(client, FACTOR_ID, " 123456 ");
    expect(verifyArgs).toEqual({ factorId: FACTOR_ID, challengeId: CHALLENGE_ID, code: "123456" });
  });

  it("surfaces a verification failure (wrong 6-digit code) as invalid_code", async () => {
    const client = fakeClient({
      verify: async () => ({ data: null, error: { message: "Invalid TOTP code entered" } }),
    });
    await expect(verifyTotpFactor(client, FACTOR_ID, "000000")).rejects.toBeInstanceOf(MfaError);
    await expect(verifyTotpFactor(client, FACTOR_ID, "000000")).rejects.toMatchObject({
      code: "invalid_code",
    });
  });

  it("surfaces a challenge-step failure without ever calling verify", async () => {
    let verifyCalled = false;
    const client = fakeClient({
      challenge: async () => ({ data: null, error: { message: "factor not found" } }),
      verify: async () => ((verifyCalled = true), { data: null, error: null }),
    });
    await expect(verifyTotpFactor(client, FACTOR_ID, "123456")).rejects.toMatchObject({
      code: "factor_not_found",
    });
    expect(verifyCalled).toBe(false);
  });
});

describe("toQrDataUrl", () => {
  // Regression: Supabase returns qr_code as a finished data URI. Prefixing it
  // again produced a data URI wrapping an encoded data URI, which browsers
  // cannot decode -- the QR rendered broken in production and users had to
  // type the secret by hand.
  it("returns a Supabase data URI unchanged rather than double-prefixing it", () => {
    const supabaseValue = "data:image/svg+xml;utf-8,<?xml version='1.0'?><svg/>";
    expect(toQrDataUrl(supabaseValue)).toBe(supabaseValue);
  });

  it("never nests a data: URI inside another data: URI", () => {
    const result = toQrDataUrl("data:image/svg+xml;utf-8,<svg/>");
    expect(result.indexOf("data:")).toBe(0);
    expect(result.slice(5).includes("data:")).toBe(false);
    expect(result.includes("data%3A")).toBe(false);
  });

  it("encodes raw SVG markup into a valid data URI", () => {
    const result = toQrDataUrl('<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>');
    expect(result.startsWith("data:image/svg+xml;charset=utf-8,")).toBe(true);
    expect(result).toContain("%3Csvg");
  });

  it("tolerates surrounding whitespace", () => {
    expect(toQrDataUrl("  data:image/svg+xml,<svg/>  ")).toBe("data:image/svg+xml,<svg/>");
  });
});

describe("unenrollFactor", () => {
  it("removes the abandoned factor by id", async () => {
    let unenrollArgs: unknown;
    const client = fakeClient({
      unenroll: async (params) => {
        unenrollArgs = params;
        return { data: { id: FACTOR_ID }, error: null };
      },
    });
    await unenrollFactor(client, FACTOR_ID);
    expect(unenrollArgs).toEqual({ factorId: FACTOR_ID });
  });

  it("maps a failure rather than resolving silently", async () => {
    const client = fakeClient({
      unenroll: async () => ({ data: null, error: { message: "factor not found" } }),
    });
    await expect(unenrollFactor(client, FACTOR_ID)).rejects.toMatchObject({
      code: "factor_not_found",
    });
  });
});

describe("listVerifiedTotpFactors / already-enrolled state", () => {
  it("returns an empty list when no factor has been enrolled", async () => {
    const client = fakeClient();
    expect(await listVerifiedTotpFactors(client)).toEqual([]);
  });

  it("returns only verified factors, dropping unverified ones", async () => {
    const client = fakeClient({
      listFactors: async () => ({
        data: {
          totp: [
            { id: "unverified-1", status: "unverified", created_at: "2026-01-01T00:00:00Z" },
            {
              id: FACTOR_ID,
              status: "verified",
              friendly_name: "Authenticator",
              created_at: "2026-01-02T00:00:00Z",
            },
          ],
        },
        error: null,
      }),
    });
    const factors = await listVerifiedTotpFactors(client);
    expect(factors).toEqual([
      {
        id: FACTOR_ID,
        status: "verified",
        friendlyName: "Authenticator",
        createdAt: "2026-01-02T00:00:00Z",
      },
    ]);
  });
});

describe("assurance level upgrade", () => {
  it("reports aal1->aal2 upgrade eligibility before verification", async () => {
    const client = fakeClient({
      getAuthenticatorAssuranceLevel: async () => ({
        data: { currentLevel: "aal1", nextLevel: "aal2" },
        error: null,
      }),
    });
    const levels = await getAssuranceLevels(client);
    expect(isAal2(levels)).toBe(false);
    expect(requiresLoginChallenge(levels)).toBe(true);
  });

  it("reports a successful AAL2 upgrade after verification", async () => {
    const client = fakeClient({
      getAuthenticatorAssuranceLevel: async () => ({
        data: { currentLevel: "aal2", nextLevel: "aal2" },
        error: null,
      }),
    });
    const levels = await getAssuranceLevels(client);
    expect(isAal2(levels)).toBe(true);
    expect(requiresLoginChallenge(levels)).toBe(false);
  });

  it("normalizes an unexpected assurance level value to null", async () => {
    const client = fakeClient({
      getAuthenticatorAssuranceLevel: async () => ({
        data: { currentLevel: "aal3" as never, nextLevel: null },
        error: null,
      }),
    });
    const levels = await getAssuranceLevels(client);
    expect(levels.currentLevel).toBeNull();
    expect(levels.nextLevel).toBeNull();
  });
});
