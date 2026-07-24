import type { PostgrestError } from "@supabase/supabase-js";
import type { RepositoryContext } from "@/backend/contracts/repository";
import { getAdminApi } from "@/integrations/supabase/v2-client";
import { approvalSummarySchema, staffAssignmentSchema } from "./contracts";
import { AdminError, mapAdminError } from "./errors";
import {
  approvalDetailSchema,
  staffPrincipalMutationSchema,
  staffStateMutationSchema,
  staffUserResolutionSchema,
  type AdminSecurityOperationsRepository,
  type PlatformAdminRequestInput,
  type StaffMutationInput,
  type StandardRoleAssignmentInput,
} from "./security-operations-contracts";

type AdminApi = ReturnType<typeof getAdminApi>;

function requireActor(context: RepositoryContext): void {
  if (!context.actorId) throw new AdminError("staff_access_denied", "Staff access is denied.");
}

function requireUuid(
  value: string,
  code: "staff_principal_not_found" | "role_assignment_not_found" | "approval_not_found",
): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new AdminError(code, "The administrative identifier is invalid.");
  }
  return value;
}

// Generated RPC types cannot express nullable PostgreSQL function arguments.
// The runtime value remains null; this adapter only narrows the generated call signature.
function nullableRpcString(value: string | null): string {
  return value as string;
}

function parse<T>(schema: { parse(value: unknown): T }, value: unknown): T {
  try {
    return schema.parse(value);
  } catch (error) {
    throw new AdminError(
      "admin_context_unavailable",
      "The Admin API returned an invalid DTO.",
      error,
    );
  }
}

function throwIfError(error: PostgrestError | null): void {
  if (error) throw mapAdminError(error);
}

async function runRpc<T>(
  request: PromiseLike<T> & { abortSignal(signal: AbortSignal): PromiseLike<T> },
  context: RepositoryContext,
): Promise<T> {
  return await (context.signal ? request.abortSignal(context.signal) : request);
}

export class SupabaseAdminSecurityOperationsRepository implements AdminSecurityOperationsRepository {
  constructor(private readonly api: AdminApi = getAdminApi()) {}

  async resolveStaffUserExact(email: string, context: RepositoryContext) {
    requireActor(context);
    const { data, error } = await runRpc(
      this.api.rpc("admin_resolve_staff_user_exact", { p_email: email.trim() }),
      context,
    );
    throwIfError(error);
    const result = parse(staffUserResolutionSchema, data);
    if (!result.found) {
      throw new AdminError(result.errorCode, "The exact staff identity could not be resolved.");
    }
    return result;
  }

  async createStaffPrincipal(
    targetAuthUserId: string,
    reason: string,
    idempotencyKey: string,
    context: RepositoryContext,
  ) {
    requireActor(context);
    const { data, error } = await runRpc(
      this.api.rpc("admin_create_staff_principal", {
        p_target_auth_user_id: requireUuid(targetAuthUserId, "staff_principal_not_found"),
        p_reason: reason,
        p_idempotency_key: requireUuid(idempotencyKey, "staff_principal_not_found"),
      }),
      context,
    );
    throwIfError(error);
    return parse(staffPrincipalMutationSchema, data);
  }

  async assignStandardRole(input: StandardRoleAssignmentInput, context: RepositoryContext) {
    requireActor(context);
    const { data, error } = await runRpc(
      this.api.rpc("admin_assign_role", {
        p_target_auth_user_id: requireUuid(input.targetAuthUserId, "staff_principal_not_found"),
        p_role_name: input.role,
        p_expires_at: nullableRpcString(input.expiresAt),
        p_reason: input.reason,
        p_reference: nullableRpcString(input.reference ?? null),
        p_idempotency_key: requireUuid(input.idempotencyKey, "staff_principal_not_found"),
        p_approval_id: undefined,
      }),
      context,
    );
    throwIfError(error);
    return parse(staffAssignmentSchema, data);
  }

  async renewRole(
    assignmentId: string,
    expiresAt: string,
    reason: string,
    reference: string | null,
    idempotencyKey: string,
    context: RepositoryContext,
  ) {
    requireActor(context);
    const { data, error } = await runRpc(
      this.api.rpc("admin_renew_role", {
        p_assignment_id: requireUuid(assignmentId, "role_assignment_not_found"),
        p_expires_at: expiresAt,
        p_reason: reason,
        p_reference: nullableRpcString(reference),
        p_idempotency_key: requireUuid(idempotencyKey, "role_assignment_not_found"),
        p_approval_id: undefined,
      }),
      context,
    );
    throwIfError(error);
    return parse(staffAssignmentSchema, data);
  }

  async shortenRoleExpiry(
    assignmentId: string,
    expiresAt: string,
    reason: string,
    idempotencyKey: string,
    context: RepositoryContext,
  ) {
    requireActor(context);
    const { data, error } = await runRpc(
      this.api.rpc("admin_shorten_role_expiry", {
        p_assignment_id: requireUuid(assignmentId, "role_assignment_not_found"),
        p_expires_at: expiresAt,
        p_reason: reason,
        p_idempotency_key: requireUuid(idempotencyKey, "role_assignment_not_found"),
      }),
      context,
    );
    throwIfError(error);
    return parse(staffAssignmentSchema, data);
  }

  async revokeRole(
    assignmentId: string,
    reason: string,
    idempotencyKey: string,
    context: RepositoryContext,
  ) {
    requireActor(context);
    const { data, error } = await runRpc(
      this.api.rpc("admin_revoke_role", {
        p_assignment_id: requireUuid(assignmentId, "role_assignment_not_found"),
        p_reason: reason,
        p_idempotency_key: requireUuid(idempotencyKey, "role_assignment_not_found"),
      }),
      context,
    );
    throwIfError(error);
    return parse(staffAssignmentSchema, data);
  }

  private async mutateStaff(
    rpcName: "admin_suspend_staff" | "admin_restore_staff" | "admin_emergency_revoke_staff",
    input: StaffMutationInput,
    context: RepositoryContext,
  ) {
    requireActor(context);
    const { data, error } = await runRpc(
      this.api.rpc(rpcName, {
        p_staff_principal_id: requireUuid(input.staffPrincipalId, "staff_principal_not_found"),
        p_reason: input.reason,
        p_idempotency_key: requireUuid(input.idempotencyKey, "staff_principal_not_found"),
      }),
      context,
    );
    throwIfError(error);
    return parse(staffStateMutationSchema, data);
  }

  suspendStaff(input: StaffMutationInput, context: RepositoryContext) {
    return this.mutateStaff("admin_suspend_staff", input, context);
  }

  restoreStaff(input: StaffMutationInput, context: RepositoryContext) {
    return this.mutateStaff("admin_restore_staff", input, context);
  }

  emergencyRevokeStaff(input: StaffMutationInput, context: RepositoryContext) {
    return this.mutateStaff("admin_emergency_revoke_staff", input, context);
  }

  async requestPlatformAdmin(input: PlatformAdminRequestInput, context: RepositoryContext) {
    requireActor(context);
    const targetAuthUserId = requireUuid(input.targetAuthUserId, "staff_principal_not_found");
    const { data, error } = await runRpc(
      this.api.rpc("admin_request_approval", {
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
        p_idempotency_key: requireUuid(input.idempotencyKey, "approval_not_found"),
      }),
      context,
    );
    throwIfError(error);
    return parse(approvalSummarySchema, data);
  }

  async getApproval(approvalId: string, context: RepositoryContext) {
    requireActor(context);
    const { data, error } = await runRpc(
      this.api.rpc("admin_get_approval", {
        p_approval_id: requireUuid(approvalId, "approval_not_found"),
      }),
      context,
    );
    throwIfError(error);
    return parse(approvalDetailSchema, data);
  }

  async approve(
    approvalId: string,
    fingerprint: string,
    reason: string,
    idempotencyKey: string,
    context: RepositoryContext,
  ) {
    requireActor(context);
    const { data, error } = await runRpc(
      this.api.rpc("admin_approve_request", {
        p_approval_id: requireUuid(approvalId, "approval_not_found"),
        p_payload_fingerprint: fingerprint,
        p_reason: reason,
        p_idempotency_key: requireUuid(idempotencyKey, "approval_not_found"),
      }),
      context,
    );
    throwIfError(error);
    return parse(approvalSummarySchema, data);
  }

  async reject(
    approvalId: string,
    reason: string,
    idempotencyKey: string,
    context: RepositoryContext,
  ) {
    requireActor(context);
    const { data, error } = await runRpc(
      this.api.rpc("admin_reject_request", {
        p_approval_id: requireUuid(approvalId, "approval_not_found"),
        p_reason: reason,
        p_idempotency_key: requireUuid(idempotencyKey, "approval_not_found"),
      }),
      context,
    );
    throwIfError(error);
    return parse(approvalSummarySchema, data);
  }

  async cancel(
    approvalId: string,
    reason: string,
    idempotencyKey: string,
    context: RepositoryContext,
  ) {
    requireActor(context);
    const { data, error } = await runRpc(
      this.api.rpc("admin_cancel_request", {
        p_approval_id: requireUuid(approvalId, "approval_not_found"),
        p_reason: reason,
        p_idempotency_key: requireUuid(idempotencyKey, "approval_not_found"),
      }),
      context,
    );
    throwIfError(error);
    return parse(approvalSummarySchema, data);
  }

  async executePlatformAdmin(
    approvalId: string,
    fingerprint: string,
    reason: string,
    idempotencyKey: string,
    context: RepositoryContext,
  ) {
    requireActor(context);
    const { data, error } = await runRpc(
      this.api.rpc("admin_execute_approved_platform_admin", {
        p_approval_id: requireUuid(approvalId, "approval_not_found"),
        p_payload_fingerprint: fingerprint,
        p_reason: reason,
        p_idempotency_key: requireUuid(idempotencyKey, "approval_not_found"),
      }),
      context,
    );
    throwIfError(error);
    return parse(approvalSummarySchema, data);
  }
}
