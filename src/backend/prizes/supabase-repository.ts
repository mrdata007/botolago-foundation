import type { PostgrestError } from "@supabase/supabase-js";
import type { RepositoryContext } from "@/backend/contracts/repository";
import { BackendError } from "@/backend/errors";
import { getFantasyApi } from "@/integrations/supabase/v2-client";
import {
  publicPrizeListSchema,
  publicPrizeWinnerPageSchema,
  type PrizeWinnerCursor,
  type PrizesRepository,
  type PublicPrizeDto,
  type PublicPrizeWinnerPageDto,
} from "./contracts";

type PrizesApi = ReturnType<typeof getFantasyApi>;

function throwIfError(error: PostgrestError | null): void {
  if (error)
    throw new BackendError("data_unavailable", "Prizes are unavailable.", {
      status: 503,
      cause: error,
    });
}

function parse<T>(schema: { parse(value: unknown): T }, value: unknown): T {
  try {
    return schema.parse(value);
  } catch (error) {
    throw new BackendError("data_unavailable", "The prizes API returned an invalid DTO.", {
      status: 502,
      cause: error,
    });
  }
}

async function runRpc<T>(
  request: PromiseLike<T> & { abortSignal(signal: AbortSignal): PromiseLike<T> },
  context: RepositoryContext,
): Promise<T> {
  return await (context.signal ? request.abortSignal(context.signal) : request);
}

/** Anonymous-callable public reads: the catalog and the winners wall. */
export class SupabasePrizesRepository implements PrizesRepository {
  constructor(private readonly api: PrizesApi | null = null) {}

  private client(): PrizesApi {
    return this.api ?? getFantasyApi();
  }

  async listPrizes(context: RepositoryContext): Promise<PublicPrizeDto[]> {
    const { data, error } = await runRpc(this.client().rpc("fantasy_prizes"), context);
    throwIfError(error);
    return parse(publicPrizeListSchema, data).items;
  }

  async listWinners(
    cursor: PrizeWinnerCursor | null,
    limit: number,
    context: RepositoryContext,
  ): Promise<PublicPrizeWinnerPageDto> {
    const { data, error } = await runRpc(
      this.client().rpc("fantasy_prize_winners", {
        p_limit: Math.min(Math.max(Math.trunc(limit), 1), 50),
        p_after_created_at: cursor?.createdAt,
        p_after_id: cursor?.id,
      }),
      context,
    );
    throwIfError(error);
    return parse(publicPrizeWinnerPageSchema, data);
  }
}
