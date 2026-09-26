import type { PostgrestError } from "@supabase/supabase-js";

import type { RepositoryContext } from "@/backend/contracts/repository";
import { getPepitesApi } from "@/integrations/supabase/v2-client";

import {
  editionResponseSchema,
  homeResponseSchema,
  methodologyResponseSchema,
  playerMatchesResponseSchema,
  playerResponseSchema,
  rankingResponseSchema,
  versionResponseSchema,
  weeklyEmailSchema,
  type EditionResponse,
  type HomeResponse,
  type MethodologyResponse,
  type PepitesRepository,
  type PlayerMatchesResponse,
  type PlayerResponse,
  type RankingQuery,
  type RankingResponse,
  type ReportableField,
  type VersionResponse,
  type WeeklyEmailDto,
} from "./contracts";
import { mapPepitesError, PepitesError } from "./errors";

type PepitesApi = ReturnType<typeof getPepitesApi>;
type RpcResult = { data: unknown; error: PostgrestError | null };
type RpcRequest = PromiseLike<RpcResult> & {
  abortSignal(signal: AbortSignal): PromiseLike<RpcResult>;
};

function parse<T>(schema: { parse(value: unknown): T }, value: unknown): T {
  try {
    return schema.parse(value);
  } catch (error) {
    throw new PepitesError("data_unavailable", "The Pépites API returned an invalid DTO.", error);
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
    throw mapPepitesError(error);
  }
  if (response.error) throw mapPepitesError(response.error);
  return parse(schema, response.data);
}

/**
 * A public read. A database the Pépites migrations have not reached answers
 * like Pépites switched off (`{ available: false }`), not as a failure.
 */
async function read<T>(
  request: RpcRequest,
  schema: { parse(value: unknown): T },
  context: RepositoryContext,
): Promise<T | { available: false }> {
  try {
    return await call(request, schema, context);
  } catch (error) {
    if (error instanceof PepitesError && error.code === "unavailable") return { available: false };
    throw error;
  }
}

/** The Pépites RPCs, through the `api` schema only. */
export class SupabasePepitesRepository implements PepitesRepository {
  constructor(private readonly api: PepitesApi | null = null) {}

  private client(): PepitesApi {
    return this.api ?? getPepitesApi();
  }

  version(context: RepositoryContext): Promise<VersionResponse> {
    return read(this.client().rpc("pepites_version"), versionResponseSchema, context);
  }

  home(version: string | null, context: RepositoryContext): Promise<HomeResponse> {
    return read(
      this.client().rpc("pepites_home", { p_version: version ?? undefined }),
      homeResponseSchema,
      context,
    );
  }

  ranking(query: RankingQuery, context: RepositoryContext): Promise<RankingResponse> {
    return read(
      this.client().rpc("pepites_ranking", {
        p_version: query.version ?? undefined,
        p_position: query.position ?? undefined,
        p_max_age: query.maxAge ?? undefined,
        p_team_id: query.teamId ?? undefined,
        p_sort: query.sort,
        p_limit: query.limit,
        p_offset: query.offset,
      }),
      rankingResponseSchema,
      context,
    );
  }

  player(
    version: string | null,
    playerId: string,
    context: RepositoryContext,
  ): Promise<PlayerResponse> {
    return read(
      // "current" resolves to the current version, like an absent one.
      this.client().rpc("pepites_player", {
        p_version: version ?? "current",
        p_player_id: playerId,
      }),
      playerResponseSchema,
      context,
    );
  }

  playerMatches(
    playerId: string,
    limit: number,
    context: RepositoryContext,
  ): Promise<PlayerMatchesResponse> {
    return read(
      this.client().rpc("pepites_player_matches", { p_player_id: playerId, p_limit: limit }),
      playerMatchesResponseSchema,
      context,
    );
  }

  edition(
    seasonId: string | null,
    week: number,
    context: RepositoryContext,
  ): Promise<EditionResponse> {
    return read(
      this.client().rpc("pepites_edition", {
        // Null means the current season; the generated type does not say so.
        p_season_id: seasonId as string,
        p_week: week,
      }),
      editionResponseSchema,
      context,
    );
  }

  methodology(context: RepositoryContext): Promise<MethodologyResponse> {
    return read(this.client().rpc("pepites_methodology"), methodologyResponseSchema, context);
  }

  myWeeklyEmail(context: RepositoryContext): Promise<WeeklyEmailDto> {
    return call(this.client().rpc("my_pepites_weekly_email"), weeklyEmailSchema, context);
  }

  setMyWeeklyEmail(enabled: boolean, context: RepositoryContext): Promise<WeeklyEmailDto> {
    return call(
      this.client().rpc("set_my_pepites_weekly_email", { p_enabled: enabled }),
      weeklyEmailSchema,
      context,
    );
  }

  async reportDataIssue(
    playerId: string,
    field: ReportableField,
    message: string,
    context: RepositoryContext,
  ): Promise<void> {
    await call(
      this.client().rpc("report_pepites_data_issue", {
        p_entity_type: "player",
        p_entity_id: playerId,
        p_field: field,
        p_message: message,
      }),
      { parse: (value: unknown) => value },
      context,
    );
  }
}
