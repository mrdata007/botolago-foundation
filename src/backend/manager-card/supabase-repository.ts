import type { PostgrestError } from "@supabase/supabase-js";
import type { RepositoryContext } from "@/backend/contracts/repository";
import { getFantasyApi } from "@/integrations/supabase/v2-client";
import {
  HISTORY_DEFAULT_LIMIT,
  HISTORY_MAX_LIMIT,
  HISTORY_MIN_LIMIT,
  MAX_CARDS_PER_READ,
  managerCardHistoryPageSchema,
  managerCardResponseSchema,
  managerCardsResponseSchema,
  type ManagerCardDto,
  type ManagerCardHistoryPageDto,
  type ManagerCardHistoryRequest,
  type ManagerCardRepository,
} from "./contracts";
import { ManagerCardError, mapManagerCardError } from "./errors";

type RpcResponse = { data: unknown; error: PostgrestError | null };
type RpcRequest = PromiseLike<RpcResponse> & {
  abortSignal(signal: AbortSignal): PromiseLike<RpcResponse>;
};

/**
 * The generated database types do not know the Manager Card functions yet
 * (they are regenerated from the migrations in CI), so the typed client would
 * reject their names. This narrow shape is all the repository uses; drop the
 * cast once `database.types.ts` carries them.
 */
interface ManagerCardApi {
  rpc(name: string, args?: Record<string, unknown>): RpcRequest;
}

function parse<T>(schema: { parse(value: unknown): T }, value: unknown): T {
  try {
    return schema.parse(value);
  } catch (error) {
    throw new ManagerCardError(
      "data_unavailable",
      "The Manager Card API returned an invalid DTO.",
      error,
    );
  }
}

async function call<T>(
  request: RpcRequest,
  schema: { parse(value: unknown): T },
  context: RepositoryContext,
): Promise<T> {
  let response: RpcResponse;
  try {
    response = await (context.signal ? request.abortSignal(context.signal) : request);
  } catch (error) {
    throw mapManagerCardError(error);
  }
  if (response.error) throw mapManagerCardError(response.error);
  return parse(schema, response.data);
}

/** The Manager Card reads, through the `api` schema only. */
export class SupabaseManagerCardRepository implements ManagerCardRepository {
  constructor(private readonly api: ManagerCardApi | null = null) {}

  private client(): ManagerCardApi {
    return this.api ?? (getFantasyApi() as unknown as ManagerCardApi);
  }

  getMyCard(context: RepositoryContext): Promise<ManagerCardDto | null> {
    return call(this.client().rpc("get_my_manager_card"), managerCardResponseSchema, context);
  }

  getCard(fantasyTeamId: string, context: RepositoryContext): Promise<ManagerCardDto | null> {
    return call(
      this.client().rpc("get_manager_card", { p_fantasy_team_id: fantasyTeamId }),
      managerCardResponseSchema,
      context,
    );
  }

  async getCards(
    fantasyTeamIds: readonly string[],
    context: RepositoryContext,
  ): Promise<readonly ManagerCardDto[]> {
    const ids = [...new Set(fantasyTeamIds)];
    if (ids.length === 0) return [];
    if (ids.length > MAX_CARDS_PER_READ)
      throw new ManagerCardError(
        "validation_failed",
        `At most ${MAX_CARDS_PER_READ} Fantasy teams per read.`,
      );
    return call(
      this.client().rpc("get_manager_cards", { p_fantasy_team_ids: ids }),
      managerCardsResponseSchema,
      context,
    );
  }

  getMyHistory(
    input: ManagerCardHistoryRequest,
    context: RepositoryContext,
  ): Promise<ManagerCardHistoryPageDto> {
    const requested = Math.trunc(input.limit ?? HISTORY_DEFAULT_LIMIT);
    return call(
      this.client().rpc("get_my_manager_card_history", {
        p_after_gameweek_sequence: input.afterGameweekSequence ?? undefined,
        p_limit: Math.min(
          Math.max(
            Number.isFinite(requested) ? requested : HISTORY_DEFAULT_LIMIT,
            HISTORY_MIN_LIMIT,
          ),
          HISTORY_MAX_LIMIT,
        ),
      }),
      managerCardHistoryPageSchema,
      context,
    );
  }
}
