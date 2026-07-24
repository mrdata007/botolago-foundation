import { describe, expect, it } from "bun:test";
import {
  directlyAssignableAdminRoleSchema,
  staffPrincipalMutationSchema,
  staffUserResolutionSchema,
} from "./security-operations-contracts";

describe("Admin security-operation DTO contracts", () => {
  it("accepts only server-catalog standard roles", () => {
    expect(directlyAssignableAdminRoleSchema.safeParse("editor").success).toBe(true);
    expect(directlyAssignableAdminRoleSchema.safeParse("security_admin").success).toBe(true);
    expect(directlyAssignableAdminRoleSchema.safeParse("platform_admin").success).toBe(false);
    expect(directlyAssignableAdminRoleSchema.safeParse("owner").success).toBe(false);
  });

  it("requires exact resolution results to mask the email", () => {
    const base = {
      found: true,
      authUserId: "11111111-1111-4111-8111-111111111111",
      emailVerified: true,
      mfaVerified: true,
      staffPrincipal: null,
      assignments: [],
    };
    expect(
      staffUserResolutionSchema.safeParse({
        ...base,
        maskedEmail: "s***@e***.test",
      }).success,
    ).toBe(true);
    expect(
      staffUserResolutionSchema.safeParse({
        ...base,
        maskedEmail: "staff@example.test",
      }).success,
    ).toBe(false);
  });

  it("keeps principal creation separate from authorization", () => {
    const result = staffPrincipalMutationSchema.parse({
      staffPrincipalId: "11111111-1111-4111-8111-111111111111",
      authUserId: "22222222-2222-4222-8222-222222222222",
      status: "active",
      mfaRequired: true,
      created: true,
      roleGranted: false,
    });
    expect(result.roleGranted).toBe(false);
    expect(JSON.stringify(result)).not.toContain("permissions");
  });
});
