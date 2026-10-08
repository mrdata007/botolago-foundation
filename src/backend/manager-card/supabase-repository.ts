import type { PostgrestError } from "@supabase/supabase-js";

import type { RepositoryContext } from "@/backend/contracts/repository";
import { getManagerCardApi } from "@/integrations/supabase/v2-client";

import {
  MAX_ACK_KEYS,
  MAX_CARDS_PER_READ,
  ackResponseSchema,
  cardsResponseSchema,
  historyResponseSchema,
  managerCardStatusSchema,
  myCardResponseSchema,
  type AckResponse,
  type CardsResponse,
  type HistoryResponse,
  type ManagerCardRepository,
  type ManagerCardStatus,
  type MyCardResponse,
} from "./contracts";
import { ManagerCardError, mapManagerCardError } from "./errors";

type ManagerCardApi = ReturnType<typeof getManagerCardApi>;
type RpcResult = { data: unknown; error: PostgrestError | null };
type RpcRequest = PromiseLike<RpcResult> & {
  abortSignal(signal: AbortSignal): PromiseLike<RpcResult>;
};

/**
 * The one typed cast. `src/backend/generated/database.types.ts` does not know the Manager Card
 * functions until the backend PR regenerates it, so `rpc` is reached through this shape. Remove
 * the cast (and call `api.rpc("get_my_manager_card")` directly) once the types exist. The client
 * is cast, not its method, so `rpc` keeps its `this`.
 */
interface UntypedApi {
  rpc(name: string, args?: Record<string, unknown>): RpcRequest;
}
const untyped = (api: ManagerCardApi): UntypedApi => api as unknown as UntypedApi;

/** The statuses a function that does not exist yet in the schema cache answers with. */
export const OFF_STATUS: ManagerCardStatus = { enabled: false, minRated: null, minConfirmed: null };

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
  let response: RpcResult;
  try {
    response = await (context.signal ? request.abortSignal(context.signal) : request);
  } catch (error) {
    throw mapManagerCardError(error);
  }
  if (response.error) throw mapManagerCardError(response.error);
  return parse(schema, response.data);
}

/**
 * A read. A database the Manager Card migrations have not reached answers like the section
 * switched off (`{ available: false }`), not as a failure.
 */
async function read<T>(
  request: RpcRequest,
  schema: { parse(value: unknown): T },
  context: RepositoryContext,
): Promise<T | { available: false }> {
  try {
    return await call(request, schema, context);
  } catch (error) {
    if (error instanceof ManagerCardError && error.code === "unavailable") {
      return { available: false };
    }
    throw error;
  }
}

/** The Manager Card RPCs, through the `api` schema only. */
export class SupabaseManagerCardRepository implements ManagerCardRepository {
  constructor(private readonly api: ManagerCardApi | null = null) {}

  private client(): UntypedApi {
    return untyped(this.api ?? getManagerCardApi());
  }

  async status(context: RepositoryContext): Promise<ManagerCardStatus> {
    try {
      return await call(this.client().rpc("manager_card_status"), managerCardStatusSchema, context);
    } catch (error) {
      if (error instanceof ManagerCardError && error.code === "unavailable") return OFF_STATUS;
      throw error;
    }
  }

  myCard(context: RepositoryContext): Promise<MyCardResponse> {
    return read(this.client().rpc("get_my_manager_card"), myCardResponseSchema, context);
  }

  async cards(teamIds: readonly string[], context: RepositoryContext): Promise<CardsResponse> {
    const ids = [...new Set(teamIds)];
    if (ids.length === 0) return { available: true, cards: [] };
    const merged: Extract<CardsResponse, { available: true }>["cards"] = [];
    for (let from = 0; from < ids.length; from += MAX_CARDS_PER_READ) {
      const answer = await read(
        this.client().rpc("get_manager_cards", {
          p_team_ids: ids.slice(from, from + MAX_CARDS_PER_READ),
        }),
        cardsResponseSchema,
        context,
      );
      if (!answer.available) return answer;
      merged.push(...answer.cards);
    }
    return { available: true, cards: merged };
  }

  myHistory(
    query: { seasonId: string | null; beforeSeq: number | null; limit: number },
    context: RepositoryContext,
  ): Promise<HistoryResponse> {
    // Nulls are sent, not omitted: a function declared without defaults is found by its full
    // argument list, and one declared with defaults accepts the nulls just the same.
    return read(
      this.client().rpc("get_my_manager_card_history", {
        p_season_id: query.seasonId,
        p_before_seq: query.beforeSeq,
        p_limit: query.limit,
      }),
      historyResponseSchema,
      context,
    );
  }

  async ackMoments(keys: readonly string[], context: RepositoryContext): Promise<AckResponse> {
    const unique = [...new Set(keys)];
    if (unique.length === 0) return { acknowledged: [], ignored: [] };
    if (unique.length > MAX_ACK_KEYS) {
      throw new ManagerCardError("invalid_request", `At most ${MAX_ACK_KEYS} keys per call.`);
    }
    return call(
      this.client().rpc("ack_manager_card_moments", { p_keys: unique }),
      ackResponseSchema,
      context,
    );
  }
}
