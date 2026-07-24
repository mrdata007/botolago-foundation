import type { PostgrestError } from "@supabase/supabase-js";
import type { RepositoryContext } from "@/backend/contracts/repository";
import { getAdminApi } from "@/integrations/supabase/v2-client";
import { approvalSummarySchema, staffContextSchema, type ApprovalSummaryDto } from "./contracts";
import {
  approvalQueuePageSchema,
  assignmentReviewPageSchema,
  auditInspectionPageSchema,
  revocationStatusSchema,
  revocationWorkerHealthSchema,
  roleCatalogSchema,
  staffPrincipalSummarySchema,
  type AdminControlPlaneRepository,
  type ApprovalQueueFilter,
  type ApprovalQueuePageDto,
  type AssignmentReviewFilter,
  type AssignmentReviewPageDto,
  type AuditInspectionFilter,
  type AuditInspectionPageDto,
  type RevocationStatusDto,
  type RevocationWorkerHealthDto,
  type RoleCatalogItemDto,
  type StaffPrincipalSummaryDto,
} from "./control-plane-contracts";
import { AdminError, mapAdminError } from "./errors";

type AdminApi = ReturnType<typeof getAdminApi>;

function requireActor(context: RepositoryContext): void {
  if (!context.actorId) throw new AdminError("staff_access_denied", "Staff access is denied.");
}

function requireUuid(value: string, code: "assignment_not_found" | "approval_not_found"): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new AdminError(code, "The administrative identifier is invalid.");
  }
  return value;
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

function boundedLimit(limit: number): number {
  return Math.min(Math.max(Math.trunc(limit), 1), 100);
}

async function runRpc<T>(
  request: PromiseLike<T> & { abortSignal(signal: AbortSignal): PromiseLike<T> },
  context: RepositoryContext,
): Promise<T> {
  return await (context.signal ? request.abortSignal(context.signal) : request);
}

export class SupabaseAdminControlPlaneRepository implements AdminControlPlaneRepository {
  constructor(private readonly api: AdminApi = getAdminApi()) {}

  async getCurrentStaffContext(context: RepositoryContext) {
    requireActor(context);
    const { data, error } = await runRpc(this.api.rpc("get_my_staff_context"), context);
    throwIfError(error);
    return parse(staffContextSchema, data);
  }

  async listAssignments(
    filter: AssignmentReviewFilter,
    cursor: AssignmentReviewPageDto["nextCursor"],
    limit: number,
    context: RepositoryContext,
  ): Promise<AssignmentReviewPageDto> {
    requireActor(context);
    const { data, error } = await runRpc(
      this.api.rpc("admin_list_staff_assignments", {
        p_role_name: filter.role ?? undefined,
        p_principal_status: filter.principalStatus ?? undefined,
        p_assignment_status: filter.assignmentStatus ?? undefined,
        p_before_created_at: cursor?.createdAt,
        p_before_id: cursor?.id,
        p_limit: boundedLimit(limit),
      }),
      context,
    );
    throwIfError(error);
    return parse(assignmentReviewPageSchema, data);
  }

  async getStaffPrincipal(
    staffPrincipalId: string,
    context: RepositoryContext,
  ): Promise<StaffPrincipalSummaryDto> {
    requireActor(context);
    const { data, error } = await runRpc(
      this.api.rpc("admin_get_staff_principal", {
        p_staff_principal_id: requireUuid(staffPrincipalId, "assignment_not_found"),
      }),
      context,
    );
    throwIfError(error);
    return parse(staffPrincipalSummarySchema, data);
  }

  async listApprovals(
    filter: ApprovalQueueFilter,
    cursor: ApprovalQueuePageDto["nextCursor"],
    limit: number,
    context: RepositoryContext,
  ): Promise<ApprovalQueuePageDto> {
    requireActor(context);
    const { data, error } = await runRpc(
      this.api.rpc("admin_list_approval_queue", {
        p_scope: filter.scope,
        p_status: filter.status ?? undefined,
        p_execution_status: filter.executionStatus ?? undefined,
        p_target_domain: filter.targetDomain ?? undefined,
        p_before_requested_at: cursor?.requestedAt,
        p_before_id: cursor?.id,
        p_limit: boundedLimit(limit),
      }),
      context,
    );
    throwIfError(error);
    return parse(approvalQueuePageSchema, data);
  }

  async approve(
    approvalId: string,
    fingerprint: string,
    reason: string,
    idempotencyKey: string,
    context: RepositoryContext,
  ): Promise<ApprovalSummaryDto> {
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
  ): Promise<ApprovalSummaryDto> {
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
  ): Promise<ApprovalSummaryDto> {
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

  async listAudit(
    filter: AuditInspectionFilter,
    cursor: AuditInspectionPageDto["nextCursor"],
    limit: number,
    context: RepositoryContext,
  ): Promise<AuditInspectionPageDto> {
    requireActor(context);
    const { data, error } = await runRpc(
      this.api.rpc("admin_list_audit_events_v2", {
        p_from: filter.from ?? undefined,
        p_to: filter.to ?? undefined,
        p_actor_principal_id: filter.actorPrincipalId ?? undefined,
        p_action: filter.action ?? undefined,
        p_target_domain: filter.targetDomain ?? undefined,
        p_target_entity_type: filter.targetEntityType ?? undefined,
        p_outcome: filter.outcome ?? undefined,
        p_correlation_id: filter.correlationId ?? undefined,
        p_approval_id: filter.approvalId ?? undefined,
        p_synthetic_test: filter.syntheticTest ?? undefined,
        p_before_occurred_at: cursor?.occurredAt,
        p_before_id: cursor?.id,
        p_limit: boundedLimit(limit),
      }),
      context,
    );
    throwIfError(error);
    return parse(auditInspectionPageSchema, data);
  }

  async listRoleCatalog(context: RepositoryContext): Promise<readonly RoleCatalogItemDto[]> {
    requireActor(context);
    const { data, error } = await runRpc(this.api.rpc("admin_list_role_catalog"), context);
    throwIfError(error);
    return parse(roleCatalogSchema, data);
  }

  async getRevocationStatus(
    staffPrincipalId: string,
    context: RepositoryContext,
  ): Promise<RevocationStatusDto> {
    requireActor(context);
    const { data, error } = await runRpc(
      this.api.rpc("admin_get_session_revocation_status", {
        p_staff_principal_id: requireUuid(staffPrincipalId, "assignment_not_found"),
      }),
      context,
    );
    throwIfError(error);
    return parse(revocationStatusSchema, data);
  }

  async getWorkerHealth(context: RepositoryContext): Promise<RevocationWorkerHealthDto> {
    requireActor(context);
    const { data, error } = await runRpc(
      this.api.rpc("admin_get_revocation_worker_health"),
      context,
    );
    throwIfError(error);
    return parse(revocationWorkerHealthSchema, data);
  }
}
