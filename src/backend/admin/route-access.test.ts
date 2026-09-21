import { describe, expect, it } from "bun:test";
import { classifyIdentityFailure } from "./route-access.server";
import { AdminError } from "./errors";
import {
  adminRouteStateSchema,
  getAdminCopy,
  UNAUTHENTICATED_DETAILS,
  maskEmail,
  requireAdminRoutePermission,
  resolveAdminRouteAccess,
  type AdminRouteDependencies,
  type UnauthenticatedDetail,
} from "./route-access";

const USER_ID = "11111111-1111-4111-8111-111111111111";

function context(overrides: Record<string, unknown> = {}) {
  return {
    isStaff: true,
    staffPrincipalId: "22222222-2222-4222-8222-222222222222",
    status: "active",
    roles: [{ name: "security_admin", expiresAt: null }],
    permissions: ["security.read_audit", "security.manage_staff"],
    emailVerified: true,
    mfaRequired: true,
    mfaEnrolled: true,
    currentAal: "aal2",
    recentAuthRequired: true,
    recentAuthSufficient: true,
    recentAuthWindowSeconds: 900,
    pendingSessionRevocation: false,
    pendingSessionRevocationCount: 0,
    accessAllowed: true,
    suspended: false,
    revoked: false,
    cachePolicy: "private, no-store",
    ...overrides,
  };
}

function dependencies(value: unknown): AdminRouteDependencies {
  return {
    verifyIdentity: async () => ({ userId: USER_ID, email: "owner@example.test" }),
    loadContext: async () => value,
  };
}

describe("Admin route server authorization", () => {
  it("returns unauthenticated when no server-verified identity exists", async () => {
    const result = await resolveAdminRouteAccess({
      verifyIdentity: async () => null,
      loadContext: async () => {
        throw new Error("must not load");
      },
    });
    expect(result.state).toBe("unauthenticated");
  });

  it("returns a stable non-staff 403 state", async () => {
    const result = await resolveAdminRouteAccess({
      verifyIdentity: async () => ({ userId: USER_ID, email: null }),
      loadContext: async () => {
        throw { code: "PT403", message: "staff_access_denied" };
      },
    });
    expect(result.state).toBe("forbidden");
  });

  it("separates MFA, recent-auth, suspended, and revoked states", async () => {
    expect(
      (await resolveAdminRouteAccess(dependencies(context({ mfaEnrolled: false })))).state,
    ).toBe("mfa_required");
    expect(
      (
        await resolveAdminRouteAccess(
          dependencies(context({ currentAal: "aal1", accessAllowed: false })),
        )
      ).state,
    ).toBe("mfa_required");
    expect(
      (await resolveAdminRouteAccess(dependencies(context({ recentAuthSufficient: false })))).state,
    ).toBe("recent_auth_required");
    expect(
      (
        await resolveAdminRouteAccess(
          dependencies(
            context({
              status: "suspended",
              suspended: true,
              accessAllowed: false,
              roles: [],
              permissions: [],
            }),
          ),
        )
      ).state,
    ).toBe("suspended");
    expect(
      (
        await resolveAdminRouteAccess(
          dependencies(
            context({
              status: "revoked",
              revoked: true,
              accessAllowed: false,
              roles: [],
              permissions: [],
            }),
          ),
        )
      ).state,
    ).toBe("revoked");
  });

  it("returns only a safe identity summary for valid staff access", async () => {
    const result = await resolveAdminRouteAccess(dependencies(context()));
    expect(result.state).toBe("authorized");
    if (result.state !== "authorized") throw new Error("expected authorized");
    expect(result.identity.emailSummary).toBe("o****@example.test");
    expect(JSON.stringify(result)).not.toContain("owner@example.test");
  });

  it("renders French and Arabic copy with an RTL-safe Arabic contract", () => {
    expect(getAdminCopy("fr").dir).toBe("ltr");
    expect(getAdminCopy("fr").title).toContain("Administration");
    expect(getAdminCopy("ar").dir).toBe("rtl");
    expect(getAdminCopy("ar").title).toContain("إدارة");
    expect(getAdminCopy("ar").states.forbidden.title).toContain("مرفوض");
  });

  it("fails malformed identity strings closed", () => {
    expect(maskEmail("not-an-email")).toBeNull();
  });

  it("enforces route-specific permissions on the server-owned context", async () => {
    const authorized = await resolveAdminRouteAccess(dependencies(context()));
    expect(requireAdminRoutePermission(authorized, "security.manage_staff").state).toBe(
      "authorized",
    );
    expect(requireAdminRoutePermission(authorized, "security.revoke_staff").state).toBe(
      "forbidden",
    );
  });
});

describe("unauthenticated reason discriminator", () => {
  // Regression: a production outage was undiagnosable because "the browser sent
  // no bearer token" and "the server could not verify the bearer token it was
  // sent" both rendered the identical "Authentification requise" panel.
  it("reports invalid_token when identity verification returns no identity", async () => {
    const result = await resolveAdminRouteAccess({
      verifyIdentity: async () => null,
      loadContext: async () => {
        throw new Error("must not load");
      },
    });
    expect(result).toEqual({ state: "unauthenticated", reason: "invalid_token" });
  });

  it("names no detail when a throw escapes verification unclassified", async () => {
    // Guessing "unverifiable" here would accuse the server of an outage on
    // evidence any anonymous caller can manufacture with a malformed token.
    const result = await resolveAdminRouteAccess({
      verifyIdentity: async () => {
        throw new Error("jwks unreachable");
      },
      loadContext: async () => {
        throw new Error("must not load");
      },
    });
    expect(result).toEqual({ state: "unauthenticated", reason: "invalid_token" });
  });

  it("distinguishes a rejected credential from a control-plane refusal", async () => {
    // Both render "unauthenticated". If they shared a reason the conflation
    // this exists to remove would simply move down a layer.
    const rejectedCredential = await resolveAdminRouteAccess({
      verifyIdentity: async () => null,
      loadContext: async () => context(),
    });
    const controlPlaneRefusal = await resolveAdminRouteAccess({
      verifyIdentity: async () => ({ userId: USER_ID, email: null }),
      loadContext: async () => {
        throw new AdminError("unauthenticated", "Authentication is required.");
      },
    });
    expect(rejectedCredential).toMatchObject({ reason: "invalid_token" });
    expect(controlPlaneRefusal).toEqual({
      state: "unauthenticated",
      reason: "backend_unauthenticated",
    });
    expect(rejectedCredential).not.toEqual(controlPlaneRefusal);
  });

  it("does not blame the credential for a failure that happened after it was accepted", async () => {
    const result = await resolveAdminRouteAccess({
      verifyIdentity: async () => ({ userId: USER_ID, email: null }),
      loadContext: async () => {
        throw new AdminError("unauthenticated", "Authentication is required.");
      },
    });
    expect(result).toMatchObject({ reason: "backend_unauthenticated" });
    expect(result).not.toMatchObject({ reason: "invalid_token" });
  });

  it("keeps a non-staff account on forbidden rather than any unauthenticated state", async () => {
    // The distinction that makes acceptance #5 meaningful: a real session that
    // simply lacks staff authority must not look like a vanished session.
    const result = await resolveAdminRouteAccess({
      verifyIdentity: async () => ({ userId: USER_ID, email: null }),
      loadContext: async () => {
        throw { code: "PT403", message: "staff_access_denied" };
      },
    });
    expect(result.state).toBe("forbidden");
  });

  it("parses both reasons, and a legacy reason-less state, through the wire schema", async () => {
    expect(
      adminRouteStateSchema.parse({ state: "unauthenticated", reason: "missing_token" }),
    ).toEqual({ state: "unauthenticated", reason: "missing_token" });
    expect(
      adminRouteStateSchema.parse({ state: "unauthenticated", reason: "invalid_token" }),
    ).toEqual({ state: "unauthenticated", reason: "invalid_token" });
    expect(adminRouteStateSchema.parse({ state: "unauthenticated" })).toEqual({
      state: "unauthenticated",
    });
    expect(() =>
      adminRouteStateSchema.parse({ state: "unauthenticated", reason: "nope" }),
    ).toThrow();
  });

  it("gives both languages distinct copy for each unauthenticated cause", () => {
    for (const lang of ["fr", "ar"] as const) {
      const copy = getAdminCopy(lang);
      const titles = [
        copy.states.unauthenticated.title,
        copy.invalidToken.title,
        copy.verificationUnavailable.title,
      ];
      expect(new Set(titles).size).toBe(3);
      for (const title of titles) expect(title.length).toBeGreaterThan(0);
      expect(copy.referenceLabel.length).toBeGreaterThan(0);
    }
  });

  it("never tells a reader to sign in again over a failure that is not theirs", () => {
    // "Vérification impossible" must not carry re-authentication wording: the
    // credential may be perfectly valid and signing in again would not help.
    for (const lang of ["fr", "ar"] as const) {
      const copy = getAdminCopy(lang);
      const text =
        `${copy.verificationUnavailable.title} ${copy.verificationUnavailable.description}`.toLowerCase();
      expect(text).not.toContain("expir");
      expect(text).not.toContain("انتهت");
    }
  });
});

describe("identity failure classification", () => {
  it("carries the classified detail onto the unauthenticated state", async () => {
    const result = await resolveAdminRouteAccess({
      verifyIdentity: async () => null,
      describeIdentityFailure: () => "expired",
      loadContext: async () => context(),
    });
    expect(result).toEqual({
      state: "unauthenticated",
      reason: "invalid_token",
      detail: "expired",
    });
  });

  it("leaves an unclassified throw without a detail", async () => {
    const result = await resolveAdminRouteAccess({
      verifyIdentity: async () => {
        throw new Error("boom");
      },
      loadContext: async () => context(),
    });
    expect(result).toEqual({ state: "unauthenticated", reason: "invalid_token" });
  });

  it("omits detail entirely when the caller does not classify", async () => {
    const result = await resolveAdminRouteAccess({
      verifyIdentity: async () => null,
      loadContext: async () => context(),
    });
    expect(result).toEqual({ state: "unauthenticated", reason: "invalid_token" });
  });

  it("reads the detail fresh on each attempt rather than pinning the first", async () => {
    // The classifier is consulted after verification, so a describe() whose
    // answer changes between attempts must be re-read, not cached.
    const answers: (UnauthenticatedDetail | undefined)[] = ["expired", "rejected", undefined];
    let attempt = 0;
    const deps: AdminRouteDependencies = {
      describeIdentityFailure: () => answers[attempt],
      verifyIdentity: async () => null,
      loadContext: async () => context(),
    };
    expect(await resolveAdminRouteAccess(deps)).toMatchObject({ detail: "expired" });
    attempt = 1;
    expect(await resolveAdminRouteAccess(deps)).toMatchObject({ detail: "rejected" });
    attempt = 2;
    expect(await resolveAdminRouteAccess(deps)).toEqual({
      state: "unauthenticated",
      reason: "invalid_token",
    });
  });
});

describe("classifyIdentityFailure", () => {
  it("names an expired token so the reader is told to sign in again", () => {
    expect(
      classifyIdentityFailure({ name: "AuthInvalidJwtError", message: "JWT has expired" }),
    ).toBe("expired");
  });

  it("separates a verification outage from a refusal", () => {
    // These never reached a verdict: the credential may well be fine.
    expect(classifyIdentityFailure({ message: "Failed to fetch" })).toBe("unverifiable");
    expect(classifyIdentityFailure({ message: "jwks endpoint unreachable" })).toBe("unverifiable");
    expect(classifyIdentityFailure({ message: "socket timeout" })).toBe("unverifiable");
    expect(classifyIdentityFailure({ status: 503, message: "upstream" })).toBe("unverifiable");
  });

  it("collapses a genuine refusal, and anything unrecognised, to rejected", () => {
    expect(classifyIdentityFailure({ name: "AuthApiError", message: "invalid claim" })).toBe(
      "rejected",
    );
    expect(
      classifyIdentityFailure({ name: "AuthInvalidJwtError", message: "Invalid JWT signature" }),
    ).toBe("rejected");
    expect(classifyIdentityFailure(null)).toBe("rejected");
    expect(classifyIdentityFailure(undefined)).toBe("rejected");
    expect(classifyIdentityFailure({ message: "something bizarre" })).toBe("rejected");
  });

  it("never echoes anything from the error into the category", () => {
    // The category is a fixed vocabulary; a hostile message cannot widen it.
    const category = classifyIdentityFailure({
      message: "user bob@example.com token eyJhbGciOiJFUzI1NiIs",
    });
    expect(UNAUTHENTICATED_DETAILS).toContain(category);
  });
});

describe("classifyIdentityFailure resists a forged verdict", () => {
  // The whole point of `unverifiable` is that it accuses the server, not the
  // caller. An operator who sees it goes looking for an outage. So a caller
  // must not be able to produce it on demand.
  it("calls a malformed token rejected, not unverifiable", () => {
    // getClaims rethrows a plain Error for these -- decodeJWT reaches
    // JSON.parse on base64url-shaped-but-not-JSON segments.
    expect(classifyIdentityFailure(new Error("Invalid UTF-8 sequence"))).toBe("rejected");
    expect(classifyIdentityFailure(new Error("Invalid alg claim"))).toBe("rejected");
    expect(classifyIdentityFailure(new Error("Unexpected token in JSON"))).toBe("rejected");
    expect(
      classifyIdentityFailure({ name: "AuthInvalidJwtError", message: "Invalid JWT structure" }),
    ).toBe("rejected");
  });

  it("reserves unverifiable for genuine transport failures", () => {
    for (const error of [
      { message: "Failed to fetch" },
      { message: "fetch failed" },
      { message: "network error" },
      { message: "socket timeout" },
      { message: "request timed out" },
      { message: "jwks endpoint unreachable" },
      { message: "connect ECONNREFUSED 10.0.0.1:443" },
      { message: "getaddrinfo ENOTFOUND supabase.co" },
      { status: 503, message: "upstream" },
    ]) {
      expect(classifyIdentityFailure(error)).toBe("unverifiable");
    }
  });

  it("treats a network deadline as an outage rather than an expired session", () => {
    // "expired" appears in some timeout messages. Matching it first would turn
    // an outage into a false "your session expired, sign in again".
    expect(classifyIdentityFailure({ message: "socket timeout: deadline expired" })).toBe(
      "unverifiable",
    );
  });

  it("only reports expired for a credential-side expiry", () => {
    expect(
      classifyIdentityFailure({ name: "AuthInvalidJwtError", message: "JWT has expired" }),
    ).toBe("expired");
  });
});
