import { describe, expect, it } from "bun:test";
import {
  approvalQueuePageSchema,
  assignmentReviewPageSchema,
  auditInspectionPageSchema,
  roleCatalogSchema,
} from "./control-plane-contracts";

describe("Admin control-plane DTO contracts", () => {
  it("keeps assignment review email- and token-free", () => {
    const parsed = assignmentReviewPageSchema.parse({
      items: [
        {
          staffPrincipalId: "11111111-1111-4111-8111-111111111111",
          principalStatus: "active",
          assignmentId: "22222222-2222-4222-8222-222222222222",
          role: "security_admin",
          status: "active",
          startsAt: "2026-07-24T17:00:00.000Z",
          expiresAt: null,
          grantedAt: "2026-07-24T17:00:00.000Z",
          grantedByPrincipalId: null,
          grantReason: "Approved security operations assignment.",
          grantReference: "phase7b:review",
          revokedAt: null,
          revocationReason: null,
          permissions: ["security.read_audit"],
          pendingSessionRevocation: false,
          pendingSessionRevocationCount: 0,
        },
      ],
      nextCursor: null,
    });
    expect(JSON.stringify(parsed)).not.toContain("email");
    expect(JSON.stringify(parsed)).not.toContain("token");
  });

  it("requires immutable approval fingerprints and explicit pagination", () => {
    const page = approvalQueuePageSchema.safeParse({
      items: [
        {
          approvalId: "11111111-1111-4111-8111-111111111111",
          status: "pending",
          operationType: "staff.assign_platform_admin",
          targetDomain: "security",
          targetEntityType: "staff",
          targetEntityId: null,
          payloadFingerprint: "a".repeat(64),
          requiredPermission: "security.manage_staff",
          requesterPrincipalId: "22222222-2222-4222-8222-222222222222",
          decidedByPrincipalId: null,
          executedByPrincipalId: null,
          reason: "Request reviewed platform access assignment.",
          requestedAt: "2026-07-24T17:00:00.000Z",
          expiresAt: "2026-07-24T17:10:00.000Z",
          decidedAt: null,
          executionStatus: "not_started",
          executedAt: null,
          correlationId: "33333333-3333-4333-8333-333333333333",
        },
      ],
      nextCursor: null,
    });
    expect(page.success).toBe(true);
  });

  it("preserves synthetic audit evidence and bounded windows", () => {
    const result = auditInspectionPageSchema.safeParse({
      items: [
        {
          id: 1,
          actorPrincipalId: null,
          effectiveRoles: [],
          effectivePermissions: [],
          action: "security.bootstrap_platform_admin",
          targetDomain: "security",
          targetEntityType: "security",
          targetEntityId: null,
          reason: "Synthetic bootstrap validation evidence.",
          requestId: "11111111-1111-4111-8111-111111111111",
          correlationId: "22222222-2222-4222-8222-222222222222",
          approvalId: null,
          safeBefore: null,
          safeAfter: { status: "active" },
          environment: "staging",
          outcome: "succeeded",
          errorCode: null,
          syntheticTest: true,
          occurredAt: "2026-07-24T17:00:00.000Z",
        },
      ],
      window: {
        from: "2026-07-23T17:00:00.000Z",
        to: "2026-07-24T17:00:00.000Z",
      },
      nextCursor: null,
    });
    expect(result.success).toBe(true);
  });

  it("rejects arbitrary roles and wildcard permissions in the catalog", () => {
    expect(
      roleCatalogSchema.safeParse([
        {
          name: "owner",
          displayLabelKey: "admin.roles.owner.label",
          descriptionKey: "admin.roles.owner.description",
          permissions: ["security.*"],
          highPrivilege: true,
          requiresDualControl: false,
          requiresRecentAuth: false,
          requiresMfaAal2: false,
        },
      ]).success,
    ).toBe(false);
  });
});
