import { describe, expect, it } from "bun:test";
import {
  adminApprovalStatusSchema,
  adminPermissionSchema,
  adminRoleSchema,
  staffContextSchema,
} from "./contracts";

describe("Admin authorization contracts", () => {
  it("accepts only server-controlled role and permission names", () => {
    expect(adminRoleSchema.parse("platform_admin")).toBe("platform_admin");
    expect(adminRoleSchema.safeParse("owner").success).toBe(false);
    expect(adminPermissionSchema.parse("security.manage_staff")).toBe("security.manage_staff");
    expect(adminPermissionSchema.safeParse("security.*").success).toBe(false);
  });

  it("requires the fixed fifteen-minute recent-auth contract", () => {
    const parsed = staffContextSchema.parse({
      staffPrincipalId: "11111111-1111-4111-8111-111111111111",
      status: "active",
      roles: [{ name: "security_admin", expiresAt: null }],
      permissions: ["security.manage_staff"],
      emailVerified: true,
      mfaRequired: true,
      mfaEnrolled: true,
      currentAal: "aal2",
      recentAuthRequired: true,
      recentAuthWindowSeconds: 900,
      accessAllowed: true,
      suspended: false,
      revoked: false,
    });
    expect(parsed.recentAuthWindowSeconds).toBe(900);
  });

  it("keeps approval lifecycle states closed and typed", () => {
    expect(adminApprovalStatusSchema.parse("approved")).toBe("approved");
    expect(adminApprovalStatusSchema.safeParse("bypassed").success).toBe(false);
  });
});
