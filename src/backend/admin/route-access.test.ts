import { describe, expect, it } from "bun:test";
import {
  adminRouteStateSchema,
  getAdminCopy,
  maskEmail,
  requireAdminRoutePermission,
  resolveAdminRouteAccess,
  type AdminRouteDependencies,
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

  it("reports invalid_token when identity verification throws", async () => {
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

  it("never reports missing_token once a token has been handed to verification", async () => {
    // missing_token is only ever produced by the request layer, before these
    // dependencies exist. If it could also appear here the two causes would be
    // conflated again.
    for (const verifyIdentity of [
      async () => null,
      async () => {
        throw new Error("boom");
      },
    ] as AdminRouteDependencies["verifyIdentity"][]) {
      const result = await resolveAdminRouteAccess({
        verifyIdentity,
        loadContext: async () => context(),
      });
      expect(result).toMatchObject({ state: "unauthenticated" });
      expect(result).not.toMatchObject({ reason: "missing_token" });
    }
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

  it("gives both languages distinct copy for a rejected token", () => {
    for (const lang of ["fr", "ar"] as const) {
      const copy = getAdminCopy(lang);
      expect(copy.invalidToken.title.length).toBeGreaterThan(0);
      expect(copy.invalidToken.title).not.toBe(copy.states.unauthenticated.title);
    }
  });
});
