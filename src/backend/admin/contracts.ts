import { z } from "zod";
import type { RepositoryContext } from "@/backend/contracts/repository";

export const adminRoleSchema = z.enum([
  "editor",
  "publisher",
  "content_admin",
  "football_operator",
  "fantasy_operator",
  "notification_operator",
  "support_agent",
  "moderator",
  "security_admin",
  "platform_admin",
]);

export const adminPermissionSchema = z.enum([
  "editorial.read",
  "editorial.write",
  "editorial.review",
  "editorial.publish",
  "editorial.manage_taxonomy",
  "editorial.manage_placements",
  "football.read_operations",
  "football.manage_mappings",
  "football.correct",
  "football.manage_ingestion",
  "fantasy.read_operations",
  "fantasy.configure_season",
  "fantasy.manage_gameweeks",
  "fantasy.correct_points",
  "fantasy.manage_rankings",
  "notifications.read_operations",
  "notifications.manage_templates",
  "notifications.inspect_delivery",
  "notifications.replay_dead_letters",
  "notifications.test_delivery",
  "users.read_support",
  "users.revoke_sessions",
  "users.moderate",
  "users.process_deletion",
  "security.read_audit",
  "security.manage_staff",
  "security.revoke_staff",
  "jobs.read",
  "jobs.run",
  "jobs.pause",
  "jobs.resume",
  "jobs.replay",
  "releases.read",
  "releases.promote",
]);

export const staffPrincipalStatusSchema = z.enum(["active", "suspended", "revoked"]);
export const staffAssignmentStatusSchema = z.enum(["active", "expired", "revoked"]);
export const adminApprovalStatusSchema = z.enum([
  "pending",
  "approved",
  "rejected",
  "cancelled",
  "expired",
]);
export const adminApprovalExecutionStatusSchema = z.enum([
  "not_started",
  "executing",
  "executed",
  "execution_failed",
]);

const staffContextRoleSchema = z.object({
  name: adminRoleSchema,
  expiresAt: z.string().datetime({ offset: true }).nullable(),
});

export const staffContextSchema = z.object({
  isStaff: z.literal(true),
  staffPrincipalId: z.string().uuid(),
  status: staffPrincipalStatusSchema,
  roles: z.array(staffContextRoleSchema),
  permissions: z.array(adminPermissionSchema),
  emailVerified: z.boolean(),
  mfaRequired: z.boolean(),
  mfaEnrolled: z.boolean(),
  currentAal: z.enum(["aal1", "aal2"]),
  recentAuthRequired: z.boolean(),
  recentAuthSufficient: z.boolean(),
  recentAuthWindowSeconds: z.literal(900),
  pendingSessionRevocation: z.boolean(),
  pendingSessionRevocationCount: z.number().int().nonnegative(),
  accessAllowed: z.boolean(),
  suspended: z.boolean(),
  revoked: z.boolean(),
  cachePolicy: z.literal("private, no-store"),
});

export const staffAssignmentSchema = z.object({
  staffPrincipalId: z.string().uuid().optional(),
  assignmentId: z.string().uuid(),
  role: adminRoleSchema,
  status: staffAssignmentStatusSchema,
  startsAt: z.string().datetime({ offset: true }).optional(),
  expiresAt: z.string().datetime({ offset: true }).nullable(),
  grantedAt: z.string().datetime({ offset: true }).optional(),
  grantReason: z.string().min(8).max(500).optional(),
  grantReference: z.string().nullable().optional(),
  revokedAt: z.string().datetime({ offset: true }).nullable().optional(),
  revocationReason: z.string().nullable().optional(),
  renewedFromAssignmentId: z.string().uuid().nullable().optional(),
  sessionRevocationRequestId: z.string().uuid().optional(),
});

export const assignmentHistoryPageSchema = z.object({
  items: z.array(staffAssignmentSchema),
  nextCursor: z
    .object({
      createdAt: z.string().datetime({ offset: true }),
      id: z.string().uuid(),
    })
    .nullable(),
});

export const approvalSummarySchema = z.object({
  approvalId: z.string().uuid(),
  status: adminApprovalStatusSchema,
  operationType: z.literal("staff.assign_platform_admin").optional(),
  targetDomain: z.literal("security").optional(),
  targetEntityId: z.string().uuid().nullable().optional(),
  payloadFingerprint: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
  reason: z.string().min(8).max(500).optional(),
  requestedAt: z.string().datetime({ offset: true }).optional(),
  expiresAt: z.string().datetime({ offset: true }).optional(),
  decidedAt: z.string().datetime({ offset: true }).nullable().optional(),
  executionStatus: adminApprovalExecutionStatusSchema.optional(),
  executedAt: z.string().datetime({ offset: true }).nullable().optional(),
  correlationId: z.string().uuid().optional(),
  result: staffAssignmentSchema.optional(),
});

export const adminAuditEventSchema = z.object({
  id: z.number().int().positive(),
  actorPrincipalId: z.string().uuid().nullable(),
  effectiveRoles: z.array(adminRoleSchema),
  effectivePermissions: z.array(adminPermissionSchema),
  action: z.string().regex(/^[a-z][a-z0-9_]{1,31}\.[a-z][a-z0-9_]{2,63}$/),
  targetDomain: z.string().regex(/^[a-z][a-z0-9_]{2,31}$/),
  targetEntityType: z
    .string()
    .regex(/^[a-z][a-z0-9_]{1,31}$/)
    .optional(),
  targetEntityId: z.string().uuid().nullable(),
  reason: z.string().min(8).max(500),
  requestId: z.string().uuid(),
  correlationId: z.string().uuid(),
  approvalId: z.string().uuid().nullable(),
  safeBefore: z.record(z.string(), z.unknown()).nullable(),
  safeAfter: z.record(z.string(), z.unknown()).nullable(),
  environment: z.enum(["local", "test", "staging", "production", "unknown"]),
  outcome: z.enum(["succeeded", "denied", "failed"]),
  errorCode: z.string().nullable(),
  syntheticTest: z.boolean().optional(),
  occurredAt: z.string().datetime({ offset: true }),
});

export const adminAuditPageSchema = z.object({
  items: z.array(adminAuditEventSchema),
  nextCursor: z
    .object({
      occurredAt: z.string().datetime({ offset: true }),
      id: z.number().int().positive(),
    })
    .nullable(),
});

export type AdminRole = z.infer<typeof adminRoleSchema>;
export type AdminPermission = z.infer<typeof adminPermissionSchema>;
export type StaffContextDto = z.infer<typeof staffContextSchema>;
export type StaffAssignmentDto = z.infer<typeof staffAssignmentSchema>;
export type AssignmentHistoryPageDto = z.infer<typeof assignmentHistoryPageSchema>;
export type ApprovalSummaryDto = z.infer<typeof approvalSummarySchema>;
export type AdminAuditPageDto = z.infer<typeof adminAuditPageSchema>;

export interface AssignRoleInput {
  readonly targetAuthUserId: string;
  readonly role: AdminRole;
  readonly expiresAt: string | null;
  readonly reason: string;
  readonly reference?: string | null;
  readonly idempotencyKey: string;
  readonly approvalId?: string | null;
}

export interface RenewRoleInput {
  readonly assignmentId: string;
  readonly expiresAt: string;
  readonly reason: string;
  readonly reference?: string | null;
  readonly idempotencyKey: string;
  readonly approvalId?: string | null;
}

export interface PlatformAdminApprovalInput {
  readonly targetAuthUserId: string;
  readonly assignmentExpiresAt: string | null;
  readonly reason: string;
  readonly approvalExpiresAt: string;
  readonly idempotencyKey: string;
}

export interface AdminAuthorizationRepository {
  getMyContext(context: RepositoryContext): Promise<StaffContextDto>;
  listActiveAssignments(
    staffPrincipalId: string,
    context: RepositoryContext,
  ): Promise<readonly StaffAssignmentDto[]>;
  listAssignmentHistory(
    staffPrincipalId: string,
    cursor: AssignmentHistoryPageDto["nextCursor"],
    limit: number,
    context: RepositoryContext,
  ): Promise<AssignmentHistoryPageDto>;
  assignRole(input: AssignRoleInput, context: RepositoryContext): Promise<StaffAssignmentDto>;
  revokeRole(
    assignmentId: string,
    reason: string,
    idempotencyKey: string,
    context: RepositoryContext,
  ): Promise<StaffAssignmentDto>;
  renewRole(input: RenewRoleInput, context: RepositoryContext): Promise<StaffAssignmentDto>;
  suspendStaff(
    staffPrincipalId: string,
    reason: string,
    idempotencyKey: string,
    context: RepositoryContext,
  ): Promise<void>;
  restoreStaff(
    staffPrincipalId: string,
    reason: string,
    idempotencyKey: string,
    context: RepositoryContext,
  ): Promise<void>;
  requestPlatformAdminApproval(
    input: PlatformAdminApprovalInput,
    context: RepositoryContext,
  ): Promise<ApprovalSummaryDto>;
  approve(
    approvalId: string,
    fingerprint: string,
    reason: string,
    idempotencyKey: string,
    context: RepositoryContext,
  ): Promise<ApprovalSummaryDto>;
  reject(
    approvalId: string,
    reason: string,
    idempotencyKey: string,
    context: RepositoryContext,
  ): Promise<ApprovalSummaryDto>;
  cancel(
    approvalId: string,
    reason: string,
    idempotencyKey: string,
    context: RepositoryContext,
  ): Promise<ApprovalSummaryDto>;
  executePlatformAdminApproval(
    approvalId: string,
    fingerprint: string,
    reason: string,
    idempotencyKey: string,
    context: RepositoryContext,
  ): Promise<ApprovalSummaryDto>;
  listAudit(
    cursor: AdminAuditPageDto["nextCursor"],
    limit: number,
    context: RepositoryContext,
  ): Promise<AdminAuditPageDto>;
}
