import { z } from "zod";
import type { RepositoryContext } from "@/backend/contracts/repository";
import {
  adminApprovalExecutionStatusSchema,
  adminApprovalStatusSchema,
  adminAuditPageSchema,
  adminPermissionSchema,
  adminRoleSchema,
  staffAssignmentStatusSchema,
  staffContextSchema,
  staffPrincipalStatusSchema,
  type AdminAuditPageDto,
  type ApprovalSummaryDto,
  type StaffContextDto,
} from "./contracts";

export const assignmentReviewItemSchema = z.object({
  staffPrincipalId: z.string().uuid(),
  principalStatus: staffPrincipalStatusSchema,
  assignmentId: z.string().uuid(),
  role: adminRoleSchema,
  status: staffAssignmentStatusSchema,
  startsAt: z.string().datetime({ offset: true }),
  expiresAt: z.string().datetime({ offset: true }).nullable(),
  grantedAt: z.string().datetime({ offset: true }),
  grantedByPrincipalId: z.string().uuid().nullable(),
  grantReason: z.string().min(8).max(500),
  grantReference: z.string().nullable(),
  revokedAt: z.string().datetime({ offset: true }).nullable(),
  revocationReason: z.string().nullable(),
  permissions: z.array(adminPermissionSchema),
  pendingSessionRevocation: z.boolean(),
  pendingSessionRevocationCount: z.number().int().nonnegative(),
});

export const assignmentReviewPageSchema = z.object({
  items: z.array(assignmentReviewItemSchema),
  nextCursor: z
    .object({
      createdAt: z.string().datetime({ offset: true }),
      id: z.string().uuid(),
    })
    .nullable(),
});

export const staffPrincipalSummarySchema = z.object({
  staffPrincipalId: z.string().uuid(),
  status: staffPrincipalStatusSchema,
  roles: z.array(
    z.object({
      name: adminRoleSchema,
      expiresAt: z.string().datetime({ offset: true }).nullable(),
    }),
  ),
  permissions: z.array(adminPermissionSchema),
  mfaRequired: z.boolean(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
  suspendedAt: z.string().datetime({ offset: true }).nullable(),
  revokedAt: z.string().datetime({ offset: true }).nullable(),
  pendingSessionRevocation: z.boolean(),
  pendingSessionRevocationCount: z.number().int().nonnegative(),
});

export const approvalQueueItemSchema = z.object({
  approvalId: z.string().uuid(),
  status: adminApprovalStatusSchema,
  operationType: z.string().regex(/^[a-z][a-z0-9_]{1,31}\.[a-z][a-z0-9_]{2,63}$/),
  targetDomain: z.string().regex(/^[a-z][a-z0-9_]{2,31}$/),
  targetEntityType: z.string().regex(/^[a-z][a-z0-9_]{1,31}$/),
  targetEntityId: z.string().uuid().nullable(),
  payloadFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  requiredPermission: adminPermissionSchema,
  requesterPrincipalId: z.string().uuid(),
  decidedByPrincipalId: z.string().uuid().nullable(),
  executedByPrincipalId: z.string().uuid().nullable(),
  reason: z.string().min(8).max(500),
  requestedAt: z.string().datetime({ offset: true }),
  expiresAt: z.string().datetime({ offset: true }),
  decidedAt: z.string().datetime({ offset: true }).nullable(),
  executionStatus: adminApprovalExecutionStatusSchema,
  executedAt: z.string().datetime({ offset: true }).nullable(),
  correlationId: z.string().uuid(),
});

export const approvalQueuePageSchema = z.object({
  items: z.array(approvalQueueItemSchema),
  nextCursor: z
    .object({
      requestedAt: z.string().datetime({ offset: true }),
      id: z.string().uuid(),
    })
    .nullable(),
});

export const auditInspectionPageSchema = adminAuditPageSchema.extend({
  window: z.object({
    from: z.string().datetime({ offset: true }),
    to: z.string().datetime({ offset: true }),
  }),
});

export const roleCatalogItemSchema = z.object({
  name: adminRoleSchema,
  displayLabelKey: z.string().min(1).max(120),
  descriptionKey: z.string().min(1).max(120),
  permissions: z.array(adminPermissionSchema),
  highPrivilege: z.boolean(),
  requiresDualControl: z.boolean(),
  requiresRecentAuth: z.boolean(),
  requiresMfaAal2: z.boolean(),
});
export const roleCatalogSchema = z.array(roleCatalogItemSchema);

export const revocationRequestStatusSchema = z.enum([
  "pending",
  "processing",
  "completed",
  "failed",
  "dead_letter",
]);
export const revocationStatusSchema = z.object({
  staffPrincipalId: z.string().uuid(),
  pendingCount: z.number().int().nonnegative(),
  deadLetterCount: z.number().int().nonnegative(),
  latest: z
    .object({
      requestId: z.string().uuid(),
      status: revocationRequestStatusSchema,
      attemptCount: z.number().int().nonnegative(),
      maxAttempts: z.number().int().positive(),
      resultCode: z.string().nullable(),
      lastErrorCode: z.string().nullable(),
      requestedAt: z.string().datetime({ offset: true }),
      nextAttemptAt: z.string().datetime({ offset: true }),
      completedAt: z.string().datetime({ offset: true }).nullable(),
      correlationId: z.string().uuid(),
    })
    .nullable(),
});

const workerRunSchema = z.object({
  runId: z.string().uuid(),
  status: z.enum(["running", "succeeded", "partial_failure", "failed"]),
  startedAt: z.string().datetime({ offset: true }),
  heartbeatAt: z.string().datetime({ offset: true }),
  completedAt: z.string().datetime({ offset: true }).nullable(),
  claimedCount: z.number().int().nonnegative(),
  completedCount: z.number().int().nonnegative(),
  retryCount: z.number().int().nonnegative(),
  deadLetterCount: z.number().int().nonnegative(),
  lastErrorCode: z.string().nullable(),
  syntheticTest: z.boolean(),
});
export const revocationWorkerHealthSchema = z.object({
  queue: z.object({
    pending: z.number().int().nonnegative(),
    processing: z.number().int().nonnegative(),
    retrying: z.number().int().nonnegative(),
    deadLetter: z.number().int().nonnegative(),
  }),
  runs: z.array(workerRunSchema).max(10),
});

export type AssignmentReviewItemDto = z.infer<typeof assignmentReviewItemSchema>;
export type AssignmentReviewPageDto = z.infer<typeof assignmentReviewPageSchema>;
export type StaffPrincipalSummaryDto = z.infer<typeof staffPrincipalSummarySchema>;
export type ApprovalQueueItemDto = z.infer<typeof approvalQueueItemSchema>;
export type ApprovalQueuePageDto = z.infer<typeof approvalQueuePageSchema>;
export type AuditInspectionPageDto = z.infer<typeof auditInspectionPageSchema>;
export type RoleCatalogItemDto = z.infer<typeof roleCatalogItemSchema>;
export type RevocationStatusDto = z.infer<typeof revocationStatusSchema>;
export type RevocationWorkerHealthDto = z.infer<typeof revocationWorkerHealthSchema>;

export interface AssignmentReviewFilter {
  readonly role?: z.infer<typeof adminRoleSchema> | null;
  readonly principalStatus?: z.infer<typeof staffPrincipalStatusSchema> | null;
  readonly assignmentStatus?: z.infer<typeof staffAssignmentStatusSchema> | null;
}

export interface ApprovalQueueFilter {
  readonly scope: "actionable" | "requested_by_me" | "all_visible";
  readonly status?: z.infer<typeof adminApprovalStatusSchema> | null;
  readonly executionStatus?: z.infer<typeof adminApprovalExecutionStatusSchema> | null;
  readonly targetDomain?: string | null;
}

export interface AuditInspectionFilter {
  readonly from?: string | null;
  readonly to?: string | null;
  readonly actorPrincipalId?: string | null;
  readonly action?: string | null;
  readonly targetDomain?: string | null;
  readonly targetEntityType?: string | null;
  readonly outcome?: "succeeded" | "denied" | "failed" | null;
  readonly correlationId?: string | null;
  readonly approvalId?: string | null;
  readonly syntheticTest?: boolean | null;
}

export interface AdminControlPlaneRepository {
  getCurrentStaffContext(context: RepositoryContext): Promise<StaffContextDto>;
  listAssignments(
    filter: AssignmentReviewFilter,
    cursor: AssignmentReviewPageDto["nextCursor"],
    limit: number,
    context: RepositoryContext,
  ): Promise<AssignmentReviewPageDto>;
  getStaffPrincipal(
    staffPrincipalId: string,
    context: RepositoryContext,
  ): Promise<StaffPrincipalSummaryDto>;
  listApprovals(
    filter: ApprovalQueueFilter,
    cursor: ApprovalQueuePageDto["nextCursor"],
    limit: number,
    context: RepositoryContext,
  ): Promise<ApprovalQueuePageDto>;
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
  listAudit(
    filter: AuditInspectionFilter,
    cursor: AdminAuditPageDto["nextCursor"],
    limit: number,
    context: RepositoryContext,
  ): Promise<AuditInspectionPageDto>;
  listRoleCatalog(context: RepositoryContext): Promise<readonly RoleCatalogItemDto[]>;
  getRevocationStatus(
    staffPrincipalId: string,
    context: RepositoryContext,
  ): Promise<RevocationStatusDto>;
  getWorkerHealth(context: RepositoryContext): Promise<RevocationWorkerHealthDto>;
}
