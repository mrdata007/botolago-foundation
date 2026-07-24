import { z } from "zod";
import type { RepositoryContext } from "@/backend/contracts/repository";
import {
  adminRoleSchema,
  approvalSummarySchema,
  staffAssignmentSchema,
  staffPrincipalStatusSchema,
  type ApprovalSummaryDto,
  type StaffAssignmentDto,
} from "./contracts";

export const directlyAssignableAdminRoleSchema = z.enum([
  "editor",
  "publisher",
  "content_admin",
  "football_operator",
  "fantasy_operator",
  "notification_operator",
  "support_agent",
  "moderator",
  "security_admin",
]);

const resolvedPrincipalSchema = z.object({
  staffPrincipalId: z.string().uuid(),
  status: staffPrincipalStatusSchema,
  mfaRequired: z.boolean(),
});

export const staffUserResolutionSchema = z.discriminatedUnion("found", [
  z.object({
    found: z.literal(false),
    errorCode: z.enum(["staff_user_not_found", "staff_user_ambiguous"]),
  }),
  z.object({
    found: z.literal(true),
    authUserId: z.string().uuid(),
    maskedEmail: z
      .string()
      .min(5)
      .max(254)
      .regex(/^[^@]*[*][^@]*@[^@]+$/),
    emailVerified: z.boolean(),
    mfaVerified: z.boolean(),
    staffPrincipal: resolvedPrincipalSchema.nullable(),
    assignments: z.array(
      staffAssignmentSchema.pick({
        assignmentId: true,
        role: true,
        status: true,
        startsAt: true,
        expiresAt: true,
      }),
    ),
  }),
]);

export const staffPrincipalMutationSchema = z.object({
  staffPrincipalId: z.string().uuid(),
  authUserId: z.string().uuid(),
  status: staffPrincipalStatusSchema,
  mfaRequired: z.boolean(),
  created: z.boolean(),
  roleGranted: z.literal(false),
});

export const staffStateMutationSchema = z.object({
  staffPrincipalId: z.string().uuid(),
  status: staffPrincipalStatusSchema,
  expiredAssignmentCount: z.number().int().nonnegative().optional(),
  revokedAssignmentCount: z.number().int().nonnegative().optional(),
  sessionRevocationRequestId: z.string().uuid(),
});

export const approvalTargetSummarySchema = z.object({
  maskedEmail: z
    .string()
    .min(5)
    .max(254)
    .regex(/^[^@]*[*][^@]*@[^@]+$/),
  emailVerified: z.boolean(),
  mfaVerified: z.boolean(),
  staffPrincipalId: z.string().uuid().nullable(),
  principalStatus: staffPrincipalStatusSchema.nullable(),
});

export const approvalDetailSchema = approvalSummarySchema.extend({
  targetSummary: approvalTargetSummarySchema.nullable(),
  executionResult: z
    .object({
      assignmentId: z.string().uuid(),
      staffPrincipalId: z.string().uuid(),
    })
    .nullable()
    .optional(),
});

export type DirectlyAssignableAdminRole = z.infer<typeof directlyAssignableAdminRoleSchema>;
export type StaffUserResolutionDto = z.infer<typeof staffUserResolutionSchema>;
export type StaffPrincipalMutationDto = z.infer<typeof staffPrincipalMutationSchema>;
export type StaffStateMutationDto = z.infer<typeof staffStateMutationSchema>;
export type ApprovalDetailDto = z.infer<typeof approvalDetailSchema>;

export interface StaffMutationInput {
  readonly staffPrincipalId: string;
  readonly reason: string;
  readonly idempotencyKey: string;
}

export interface StandardRoleAssignmentInput {
  readonly targetAuthUserId: string;
  readonly role: DirectlyAssignableAdminRole;
  readonly expiresAt: string | null;
  readonly reason: string;
  readonly reference?: string | null;
  readonly idempotencyKey: string;
}

export interface PlatformAdminRequestInput {
  readonly targetAuthUserId: string;
  readonly assignmentExpiresAt: string | null;
  readonly reason: string;
  readonly approvalExpiresAt: string;
  readonly idempotencyKey: string;
}

export interface AdminSecurityOperationsRepository {
  resolveStaffUserExact(email: string, context: RepositoryContext): Promise<StaffUserResolutionDto>;
  createStaffPrincipal(
    targetAuthUserId: string,
    reason: string,
    idempotencyKey: string,
    context: RepositoryContext,
  ): Promise<StaffPrincipalMutationDto>;
  assignStandardRole(
    input: StandardRoleAssignmentInput,
    context: RepositoryContext,
  ): Promise<StaffAssignmentDto>;
  renewRole(
    assignmentId: string,
    expiresAt: string,
    reason: string,
    reference: string | null,
    idempotencyKey: string,
    context: RepositoryContext,
  ): Promise<StaffAssignmentDto>;
  shortenRoleExpiry(
    assignmentId: string,
    expiresAt: string,
    reason: string,
    idempotencyKey: string,
    context: RepositoryContext,
  ): Promise<StaffAssignmentDto>;
  revokeRole(
    assignmentId: string,
    reason: string,
    idempotencyKey: string,
    context: RepositoryContext,
  ): Promise<StaffAssignmentDto>;
  suspendStaff(
    input: StaffMutationInput,
    context: RepositoryContext,
  ): Promise<StaffStateMutationDto>;
  restoreStaff(
    input: StaffMutationInput,
    context: RepositoryContext,
  ): Promise<StaffStateMutationDto>;
  emergencyRevokeStaff(
    input: StaffMutationInput,
    context: RepositoryContext,
  ): Promise<StaffStateMutationDto>;
  requestPlatformAdmin(
    input: PlatformAdminRequestInput,
    context: RepositoryContext,
  ): Promise<ApprovalSummaryDto>;
  getApproval(approvalId: string, context: RepositoryContext): Promise<ApprovalDetailDto>;
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
  executePlatformAdmin(
    approvalId: string,
    fingerprint: string,
    reason: string,
    idempotencyKey: string,
    context: RepositoryContext,
  ): Promise<ApprovalSummaryDto>;
}

export { adminRoleSchema };
