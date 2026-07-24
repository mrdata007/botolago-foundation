import type { PostgrestError } from "@supabase/supabase-js";
import { getAdminApi } from "@/integrations/supabase/v2-client";
import type { RepositoryContext } from "@/backend/contracts/repository";
import {
  adminAuditPageSchema,
  approvalSummarySchema,
  assignmentHistoryPageSchema,
  staffAssignmentSchema,
  staffContextSchema,
  type AdminAuditPageDto,
  type AdminAuthorizationRepository,
  type ApprovalSummaryDto,
  type AssignRoleInput,
  type AssignmentHistoryPageDto,
  type PlatformAdminApprovalInput,
  type RenewRoleInput,
  type StaffAssignmentDto,
  type StaffContextDto,
} from "./contracts";
import { AdminError, mapAdminError } from "./errors";

function requireActor(context: RepositoryContext): void {
  if (!context.actorId) throw new AdminError("staff_access_denied", "Staff access is denied.");
}

function throwIfError(error: PostgrestError | null): void {
  if (error) throw mapAdminError(error);
}

function requireUuid(value: string, code: "staff_role_invalid" | "approval_not_found"): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new AdminError(code, "The administrative identifier is invalid.");
  }
  return value;
}

function parse<T>(schema: { parse(value: unknown): T }, value: unknown): T {
  try {
    return schema.parse(value);
  } catch (error) {
    throw new AdminError("staff_access_denied", "The Admin API returned an invalid DTO.", error);
  }
}

export class SupabaseAdminAuthorizationRepository implements AdminAuthorizationRepository {
  async getMyContext(context: RepositoryContext): Promise<StaffContextDto> {
    requireActor(context);
    const { data, error } = await getAdminApi().rpc("get_my_staff_context");
    throwIfError(error);
    return parse(staffContextSchema, data);
  }

  async listActiveAssignments(
    staffPrincipalId: string,
    context: RepositoryContext,
  ): Promise<readonly StaffAssignmentDto[]> {
    requireActor(context);
    const { data, error } = await getAdminApi().rpc("admin_list_active_assignments", {
      p_staff_principal_id: requireUuid(staffPrincipalId, "staff_role_invalid"),
    });
    throwIfError(error);
    return parse(staffAssignmentSchema.array(), data);
  }

  async listAssignmentHistory(
    staffPrincipalId: string,
    cursor: AssignmentHistoryPageDto["nextCursor"],
    limit: number,
    context: RepositoryContext,
  ): Promise<AssignmentHistoryPageDto> {
    requireActor(context);
    const { data, error } = await getAdminApi().rpc("admin_list_assignment_history", {
      p_staff_principal_id: requireUuid(staffPrincipalId, "staff_role_invalid"),
      p_before_created_at: cursor?.createdAt,
      p_before_id: cursor?.id,
      p_limit: Math.min(Math.max(limit, 1), 100),
    });
    throwIfError(error);
    return parse(assignmentHistoryPageSchema, data);
  }

  async assignRole(
    input: AssignRoleInput,
    context: RepositoryContext,
  ): Promise<StaffAssignmentDto> {
    requireActor(context);
    const { data, error } = await getAdminApi().rpc("admin_assign_role", {
      p_target_auth_user_id: requireUuid(input.targetAuthUserId, "staff_role_invalid"),
      p_role_name: input.role,
      p_expires_at: (input.expiresAt ?? null) as string,
      p_reason: input.reason,
      p_reference: (input.reference ?? null) as string,
      p_idempotency_key: requireUuid(input.idempotencyKey, "staff_role_invalid"),
      p_approval_id: input.approvalId ?? undefined,
    });
    throwIfError(error);
    return parse(staffAssignmentSchema, data);
  }

  async revokeRole(
    assignmentId: string,
    reason: string,
    idempotencyKey: string,
    context: RepositoryContext,
  ): Promise<StaffAssignmentDto> {
    requireActor(context);
    const { data, error } = await getAdminApi().rpc("admin_revoke_role", {
      p_assignment_id: requireUuid(assignmentId, "staff_role_invalid"),
      p_reason: reason,
      p_idempotency_key: requireUuid(idempotencyKey, "staff_role_invalid"),
    });
    throwIfError(error);
    return parse(staffAssignmentSchema, data);
  }

  async renewRole(input: RenewRoleInput, context: RepositoryContext): Promise<StaffAssignmentDto> {
    requireActor(context);
    const { data, error } = await getAdminApi().rpc("admin_renew_role", {
      p_assignment_id: requireUuid(input.assignmentId, "staff_role_invalid"),
      p_expires_at: input.expiresAt,
      p_reason: input.reason,
      p_reference: (input.reference ?? null) as string,
      p_idempotency_key: requireUuid(input.idempotencyKey, "staff_role_invalid"),
      p_approval_id: input.approvalId ?? undefined,
    });
    throwIfError(error);
    return parse(staffAssignmentSchema, data);
  }

  async suspendStaff(
    staffPrincipalId: string,
    reason: string,
    idempotencyKey: string,
    context: RepositoryContext,
  ): Promise<void> {
    requireActor(context);
    const { error } = await getAdminApi().rpc("admin_suspend_staff", {
      p_staff_principal_id: requireUuid(staffPrincipalId, "staff_role_invalid"),
      p_reason: reason,
      p_idempotency_key: requireUuid(idempotencyKey, "staff_role_invalid"),
    });
    throwIfError(error);
  }

  async restoreStaff(
    staffPrincipalId: string,
    reason: string,
    idempotencyKey: string,
    context: RepositoryContext,
  ): Promise<void> {
    requireActor(context);
    const { error } = await getAdminApi().rpc("admin_restore_staff", {
      p_staff_principal_id: requireUuid(staffPrincipalId, "staff_role_invalid"),
      p_reason: reason,
      p_idempotency_key: requireUuid(idempotencyKey, "staff_role_invalid"),
    });
    throwIfError(error);
  }

  async requestPlatformAdminApproval(
    input: PlatformAdminApprovalInput,
    context: RepositoryContext,
  ): Promise<ApprovalSummaryDto> {
    requireActor(context);
    const targetAuthUserId = requireUuid(input.targetAuthUserId, "staff_role_invalid");
    const { data, error } = await getAdminApi().rpc("admin_request_approval", {
      p_required_permission: "security.manage_staff",
      p_target_domain: "security",
      p_target_entity_id: targetAuthUserId,
      p_operation_type: "staff.assign_platform_admin",
      p_safe_payload_reference: {
        targetAuthUserId,
        role: "platform_admin",
        expiresAt: input.assignmentExpiresAt,
      },
      p_reason: input.reason,
      p_expires_at: input.approvalExpiresAt,
      p_idempotency_key: requireUuid(input.idempotencyKey, "staff_role_invalid"),
    });
    throwIfError(error);
    return parse(approvalSummarySchema, data);
  }

  async approve(
    approvalId: string,
    fingerprint: string,
    reason: string,
    idempotencyKey: string,
    context: RepositoryContext,
  ): Promise<ApprovalSummaryDto> {
    requireActor(context);
    const { data, error } = await getAdminApi().rpc("admin_approve_request", {
      p_approval_id: requireUuid(approvalId, "approval_not_found"),
      p_payload_fingerprint: fingerprint,
      p_reason: reason,
      p_idempotency_key: requireUuid(idempotencyKey, "staff_role_invalid"),
    });
    throwIfError(error);
    return parse(approvalSummarySchema, data);
  }

  async reject(
    approvalId: string,
    reason: string,
    idempotencyKey: string,
    context: RepositoryContext,
  ): Promise<ApprovalSummaryDto> {
    requireActor(context);
    const { data, error } = await getAdminApi().rpc("admin_reject_request", {
      p_approval_id: requireUuid(approvalId, "approval_not_found"),
      p_reason: reason,
      p_idempotency_key: requireUuid(idempotencyKey, "staff_role_invalid"),
    });
    throwIfError(error);
    return parse(approvalSummarySchema, data);
  }

  async cancel(
    approvalId: string,
    reason: string,
    idempotencyKey: string,
    context: RepositoryContext,
  ): Promise<ApprovalSummaryDto> {
    requireActor(context);
    const { data, error } = await getAdminApi().rpc("admin_cancel_request", {
      p_approval_id: requireUuid(approvalId, "approval_not_found"),
      p_reason: reason,
      p_idempotency_key: requireUuid(idempotencyKey, "staff_role_invalid"),
    });
    throwIfError(error);
    return parse(approvalSummarySchema, data);
  }

  async executePlatformAdminApproval(
    approvalId: string,
    fingerprint: string,
    reason: string,
    idempotencyKey: string,
    context: RepositoryContext,
  ): Promise<ApprovalSummaryDto> {
    requireActor(context);
    const { data, error } = await getAdminApi().rpc("admin_execute_approved_platform_admin", {
      p_approval_id: requireUuid(approvalId, "approval_not_found"),
      p_payload_fingerprint: fingerprint,
      p_reason: reason,
      p_idempotency_key: requireUuid(idempotencyKey, "staff_role_invalid"),
    });
    throwIfError(error);
    return parse(approvalSummarySchema, data);
  }

  async listAudit(
    cursor: AdminAuditPageDto["nextCursor"],
    limit: number,
    context: RepositoryContext,
  ): Promise<AdminAuditPageDto> {
    requireActor(context);
    const { data, error } = await getAdminApi().rpc("admin_list_audit_events", {
      p_before_occurred_at: cursor?.occurredAt,
      p_before_id: cursor?.id,
      p_limit: Math.min(Math.max(limit, 1), 100),
    });
    throwIfError(error);
    return parse(adminAuditPageSchema, data);
  }
}
