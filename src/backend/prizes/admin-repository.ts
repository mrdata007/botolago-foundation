import type { PostgrestError } from "@supabase/supabase-js";
import type { RepositoryContext } from "@/backend/contracts/repository";
import { AdminError, mapAdminError } from "@/backend/admin/errors";
import { getAdminApi } from "@/integrations/supabase/v2-client";
import {
  adminPrizeFlagListSchema,
  adminPrizeFlagResultSchema,
  adminPrizeListSchema,
  adminPrizeSchema,
  adminPrizeSettingsSchema,
  adminPrizeWinnerPageSchema,
  adminPrizeWinnerSchema,
  PrizeAdminError,
  prizeAdminErrorCode,
  type AdminPrizeDraft,
  type AdminPrizeDto,
  type AdminPrizeFlagDto,
  type AdminPrizeSettingsDto,
  type AdminPrizeWinnerDto,
  type AdminPrizeWinnerPageDto,
  type AdminPrizeWinnerTransition,
  type PrizeWinnerCursor,
  type PrizeWinnerStatus,
  type PrizesAdminRepository,
} from "./contracts";

type AdminApi = ReturnType<typeof getAdminApi>;

/**
 * The prize console's calls. Every function re-checks `prizes.manage`, MFA and
 * recent authentication in the database and audits its writes; nothing here
 * is an authority.
 *
 * Two kinds of "no value" are sent differently, and the difference matters:
 * an argument with an SQL default may be omitted (`undefined`), but one without
 * a default must be present as JSON `null` -- PostgREST resolves a function by
 * the names it is sent, and a missing name is "function not found". The
 * generated argument types cannot express nullable-but-required, hence the
 * `as never` on those calls.
 */
export function mapPrizeAdminError(error: unknown): PrizeAdminError | AdminError {
  const code = prizeAdminErrorCode(error);
  return code ? new PrizeAdminError(code, error) : mapAdminError(error);
}

function throwIfError(error: PostgrestError | null): void {
  if (error) throw mapPrizeAdminError(error);
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

const optional = <T>(value: T | null): T | undefined => (value === null ? undefined : value);

export class SupabasePrizesAdminRepository implements PrizesAdminRepository {
  constructor(private readonly api: AdminApi | null = null) {}

  private client(): AdminApi {
    return this.api ?? getAdminApi();
  }

  async listPrizes(context: RepositoryContext): Promise<AdminPrizeDto[]> {
    requireActor(context);
    const { data, error } = await runRpc(this.client().rpc("admin_list_fantasy_prizes"), context);
    throwIfError(error);
    return parse(adminPrizeListSchema, data).items;
  }

  async savePrize(
    draft: AdminPrizeDraft,
    reason: string,
    idempotencyKey: string,
    context: RepositoryContext,
  ): Promise<AdminPrizeDto> {
    requireActor(context);
    const { data, error } = await runRpc(
      this.client().rpc("admin_save_fantasy_prize", {
        p_prize_id: draft.id,
        p_tier: draft.tier,
        p_name_fr: draft.nameFr,
        p_name_ar: draft.nameAr,
        p_description_fr: draft.descriptionFr,
        p_description_ar: draft.descriptionAr,
        p_estimated_value_mad: draft.estimatedValueMad,
        p_sponsor_name: draft.sponsorName,
        p_sponsor_logo_url: draft.sponsorLogoUrl,
        p_image_url: draft.imageUrl,
        p_active: draft.active,
        p_reason: reason,
        p_idempotency_key: idempotencyKey,
      } as never),
      context,
    );
    throwIfError(error);
    return parse(adminPrizeSchema, data);
  }

  async getSettings(
    seasonId: string | null,
    context: RepositoryContext,
  ): Promise<AdminPrizeSettingsDto> {
    requireActor(context);
    const { data, error } = await runRpc(
      this.client().rpc("admin_get_fantasy_prize_settings", { p_season_id: optional(seasonId) }),
      context,
    );
    throwIfError(error);
    return parse(adminPrizeSettingsSchema, data);
  }

  async saveSettings(
    input: { seasonId: string; gameweekCount: number; miniLeagueMinMembers: number },
    reason: string,
    idempotencyKey: string,
    context: RepositoryContext,
  ): Promise<AdminPrizeSettingsDto> {
    requireActor(context);
    const { data, error } = await runRpc(
      this.client().rpc("admin_save_fantasy_prize_settings", {
        p_season_id: input.seasonId,
        p_gameweek_count: input.gameweekCount,
        p_mini_league_min_members: input.miniLeagueMinMembers,
        p_reason: reason,
        p_idempotency_key: idempotencyKey,
      }),
      context,
    );
    throwIfError(error);
    return parse(adminPrizeSettingsSchema, data);
  }

  async listWinners(
    status: PrizeWinnerStatus | null,
    cursor: PrizeWinnerCursor | null,
    limit: number,
    context: RepositoryContext,
  ): Promise<AdminPrizeWinnerPageDto> {
    requireActor(context);
    const { data, error } = await runRpc(
      this.client().rpc("admin_list_fantasy_prize_winners", {
        p_status: optional(status),
        p_limit: Math.min(Math.max(Math.trunc(limit), 1), 100),
        p_after_created_at: cursor?.createdAt,
        p_after_id: cursor?.id,
      }),
      context,
    );
    throwIfError(error);
    return parse(adminPrizeWinnerPageSchema, data);
  }

  async setWinnerStatus(
    winnerId: string,
    status: AdminPrizeWinnerTransition,
    note: string,
    idempotencyKey: string,
    context: RepositoryContext,
  ): Promise<AdminPrizeWinnerDto> {
    requireActor(context);
    const { data, error } = await runRpc(
      this.client().rpc("admin_set_fantasy_prize_winner_status", {
        p_winner_id: winnerId,
        p_status: status,
        p_note: note,
        p_idempotency_key: idempotencyKey,
      }),
      context,
    );
    throwIfError(error);
    return parse(adminPrizeWinnerSchema, data);
  }

  async addWinnerNote(
    winnerId: string,
    note: string,
    idempotencyKey: string,
    context: RepositoryContext,
  ): Promise<AdminPrizeWinnerDto> {
    requireActor(context);
    const { data, error } = await runRpc(
      this.client().rpc("admin_add_fantasy_prize_winner_note", {
        p_winner_id: winnerId,
        p_note: note,
        p_idempotency_key: idempotencyKey,
      }),
      context,
    );
    throwIfError(error);
    return parse(adminPrizeWinnerSchema, data);
  }

  async overrideWinner(
    winnerId: string,
    replacementUsername: string,
    reason: string,
    idempotencyKey: string,
    context: RepositoryContext,
  ): Promise<AdminPrizeWinnerDto> {
    requireActor(context);
    const { data, error } = await runRpc(
      this.client().rpc("admin_override_fantasy_prize_winner", {
        p_winner_id: winnerId,
        p_fantasy_team_id: null,
        p_username: replacementUsername,
        p_reason: reason,
        p_idempotency_key: idempotencyKey,
      } as never),
      context,
    );
    throwIfError(error);
    return parse(adminPrizeWinnerSchema, data);
  }

  async listFlags(context: RepositoryContext): Promise<AdminPrizeFlagDto[]> {
    requireActor(context);
    const { data, error } = await runRpc(
      this.client().rpc("admin_list_fantasy_prize_flags"),
      context,
    );
    throwIfError(error);
    return parse(adminPrizeFlagListSchema, data).items;
  }

  async setFlag(
    account: { userId: string } | { username: string },
    flagged: boolean,
    reason: string,
    idempotencyKey: string,
    context: RepositoryContext,
  ): Promise<{ userId: string; flagged: boolean }> {
    requireActor(context);
    const { data, error } = await runRpc(
      this.client().rpc("admin_set_fantasy_prize_flag", {
        p_user_id: "userId" in account ? account.userId : null,
        p_username: "username" in account ? account.username : null,
        p_flagged: flagged,
        p_reason: reason,
        p_idempotency_key: idempotencyKey,
      } as never),
      context,
    );
    throwIfError(error);
    return parse(adminPrizeFlagResultSchema, data);
  }
}
