import type { PostgrestError } from "@supabase/supabase-js";
import type { RepositoryContext } from "@/backend/contracts/repository";
import { AdminError, mapAdminError } from "@/backend/admin/errors";
import { getAdminApi } from "@/integrations/supabase/v2-client";
import {
  adminUserDetailSchema,
  adminUserPageSchema,
  adminUserSchema,
  analyticsOverviewSchema,
  UserAdminError,
  userAdminErrorCode,
  type AdminUserCursor,
  type AdminUserDetailDto,
  type AdminUserDto,
  type AdminUserFilters,
  type AdminUserPageDto,
  type AnalyticsOverviewDto,
  type UsersAdminRepository,
} from "./users-contracts";

type AdminApi = ReturnType<typeof getAdminApi>;

/**
 * The user directory's calls. Each database function re-checks the caller's
 * permission, MFA and (for a ban) recent authentication, and audits its
 * writes; nothing here is an authority.
 */
export function mapUserAdminError(error: unknown): UserAdminError | AdminError {
  const code = userAdminErrorCode(error);
  return code ? new UserAdminError(code, error) : mapAdminError(error);
}

function throwIfError(error: PostgrestError | null): void {
  if (error) throw mapUserAdminError(error);
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

function requireActor(context: RepositoryContext): void {
  if (!context.actorId) throw new AdminError("staff_access_denied", "Staff access is denied.");
}

async function runRpc<T>(
  request: PromiseLike<T> & { abortSignal(signal: AbortSignal): PromiseLike<T> },
  context: RepositoryContext,
): Promise<T> {
  return await (context.signal ? request.abortSignal(context.signal) : request);
}

export class SupabaseUsersAdminRepository implements UsersAdminRepository {
  constructor(private readonly api: AdminApi | null = null) {}

  private client(): AdminApi {
    return this.api ?? getAdminApi();
  }

  async listUsers(
    filters: AdminUserFilters,
    cursor: AdminUserCursor | null,
    limit: number,
    context: RepositoryContext,
  ): Promise<AdminUserPageDto> {
    requireActor(context);
    const { data, error } = await runRpc(
      this.client().rpc("admin_list_users", {
        p_query: filters.query?.trim() || undefined,
        p_status: filters.status ?? undefined,
        p_limit: Math.min(Math.max(Math.trunc(limit), 1), 100),
        p_after_created_at: cursor?.createdAt,
        p_after_id: cursor?.id,
      }),
      context,
    );
    throwIfError(error);
    return parse(adminUserPageSchema, data);
  }

  async getUser(userId: string, context: RepositoryContext): Promise<AdminUserDetailDto> {
    requireActor(context);
    const { data, error } = await runRpc(
      this.client().rpc("admin_get_user", { p_user_id: userId }),
      context,
    );
    throwIfError(error);
    return parse(adminUserDetailSchema, data);
  }

  async banUser(
    userId: string,
    reason: string,
    durationHours: number | null,
    idempotencyKey: string,
    context: RepositoryContext,
  ): Promise<AdminUserDto> {
    requireActor(context);
    // `p_duration_hours` has no SQL default, so "until lifted" is sent as a
    // JSON null rather than omitted: PostgREST resolves a function by the
    // argument names it receives. The generated types cannot say
    // nullable-but-required, hence `as never`.
    const { data, error } = await runRpc(
      this.client().rpc("admin_ban_user", {
        p_user_id: userId,
        p_reason: reason,
        p_duration_hours: durationHours,
        p_idempotency_key: idempotencyKey,
      } as never),
      context,
    );
    throwIfError(error);
    return parse(adminUserSchema, data);
  }

  async unbanUser(
    userId: string,
    reason: string,
    idempotencyKey: string,
    context: RepositoryContext,
  ): Promise<AdminUserDto> {
    requireActor(context);
    const { data, error } = await runRpc(
      this.client().rpc("admin_unban_user", {
        p_user_id: userId,
        p_reason: reason,
        p_idempotency_key: idempotencyKey,
      }),
      context,
    );
    throwIfError(error);
    return parse(adminUserSchema, data);
  }

  async getAnalyticsOverview(context: RepositoryContext): Promise<AnalyticsOverviewDto> {
    requireActor(context);
    const { data, error } = await runRpc(
      this.client().rpc("admin_get_analytics_overview"),
      context,
    );
    throwIfError(error);
    return parse(analyticsOverviewSchema, data);
  }
}
