import { describe, expect, it } from "bun:test";
import {
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

  it("renders launch-ready French and Arabic copy with an RTL-safe Arabic contract", () => {
    const fr = getAdminCopy("fr");
    const ar = getAdminCopy("ar");
    expect(fr.dir).toBe("ltr");
    expect(fr.title).toContain("Administration");
    expect(fr.subtitle).not.toContain("Phase");
    expect(fr.labels.signIn).toBe("Se connecter");
    expect(ar.dir).toBe("rtl");
    expect(ar.title).toContain("إدارة");
    expect(ar.subtitle).not.toContain("المرحلة");
    expect(ar.labels.signIn).toBe("تسجيل الدخول");
    expect(ar.states.forbidden.title).toContain("مرفوض");
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
