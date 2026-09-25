import type { RepositoryContext } from "../../src/backend/contracts/repository";
import type { FootballLanguage } from "../../src/backend/football/contracts";
import { MockFootballRepository } from "../../src/backend/football/mock-repository";
import { MockNewsRepository } from "../../src/backend/news/mock-repository";
import { MockPredictionsRepository } from "../../src/backend/predictions/mock-repository";
import { MockPrizesRepository } from "../../src/backend/prizes/mock-repository";

/**
 * The Supabase the production-bundle smoke test talks to: a local HTTP server
 * standing in for PostgREST, on its own port so the browser reaches it
 * cross-origin exactly as it reaches the real project.
 *
 * It answers the public read RPCs the smoke routes make, from the same mock
 * repositories the development server's mock mode uses, so the built pages
 * render real cards rather than empty states. An RPC it does not know answers
 * 404 the way PostgREST does and is recorded; the smoke test reads and clears
 * that record (`DELETE /__stub/unhandled`) and names it, so a page that starts
 * calling something new fails with the name of what to add here. Nothing here
 * writes, and nothing is forwarded anywhere.
 */

type Args = Record<string, unknown>;
type Handler = (args: Args) => unknown;

const context: RepositoryContext = { actorId: null, requestId: "built-output-smoke" };
const football = new MockFootballRepository();
const news = new MockNewsRepository();
const prizes = new MockPrizesRepository();
const predictions = new MockPredictionsRepository();

/**
 * What `api.fantasy_hub` tells a visitor with no team: a season open for
 * registration and its first gameweek, deadline two days out. Fantasy has no
 * V2 mock repository to take this from (its mock mode is a separate,
 * client-side game), so it is written out here against `fantasyHubSchema`.
 */
function fantasyHub() {
  const gameweek = {
    id: "00000090-0000-4000-8000-000000000001",
    sequence: 1,
    name: "1",
    deadlineAt: new Date(Date.now() + 2 * 24 * 3_600_000).toISOString(),
    status: "open",
  };
  return {
    season: {
      id: "00000090-0000-4000-8000-000000000000",
      name: "2026/2027",
      status: "registration_open",
    },
    gameweek: { ...gameweek, pointsState: "provisional" },
    enrolmentGameweek: gameweek,
    team: null,
    rankingAvailable: false,
  };
}

const language = (args: Args): FootballLanguage => (args.p_language === "ar" ? "ar" : "fr");
const limit = (args: Args, fallback: number) =>
  typeof args.p_limit === "number" ? args.p_limit : fallback;
const text = (value: unknown) => (typeof value === "string" ? value : undefined);

const RPC: Record<string, Handler> = {
  football_season_catalog: (args) => football.getSeasons(language(args), limit(args, 12), context),
  football_team_catalog: (args) => football.getTeams(language(args), limit(args, 100)),
  football_home_matches: (args) => football.getHomeMatches(language(args), limit(args, 3), context),
  football_live_matches: (args) =>
    football.getLiveMatches(language(args), limit(args, 20), context),
  // The day in the zone the page asks for, as the real RPC does. The mock
  // repository's own date filter uses this process's zone instead, which
  // near midnight is a different day from Casablanca's.
  football_matches_by_date: async (args) => {
    if (args.p_after_id) return { items: [], nextCursor: null };
    const competition = await football.getCompetition();
    const { items } = await football.getCompetitionFixtures({
      competitionId: competition.id,
      seasonId: text(args.p_season_id),
      language: language(args),
      limit: 1_000,
    });
    const day = new Intl.DateTimeFormat("en-CA", {
      timeZone: text(args.p_timezone) ?? "Africa/Casablanca",
    });
    return {
      items: items.filter((match) => day.format(new Date(match.kickoffAt)) === args.p_date),
      nextCursor: null,
    };
  },
  football_standings: (args) =>
    football.getStandings(String(args.p_season_id), language(args), context),
  football_competition_fixtures: (args) =>
    football.getCompetitionFixtures({
      competitionId: String(args.p_competition_id),
      seasonId: text(args.p_season_id),
      after:
        args.p_after_id && args.p_after_kickoff
          ? { id: String(args.p_after_id), kickoffAt: String(args.p_after_kickoff) }
          : undefined,
      limit: limit(args, 50),
      language: language(args),
    }),
  news_home_modules: (args) => news.getHomeModules(language(args), limit(args, 6)),
  news_feed: (args) =>
    args.p_after_id
      ? { items: [], nextCursor: null }
      : news.getFeed({
          language: language(args),
          limit: limit(args, 20),
          categorySlug: text(args.p_category_slug),
          teamId: text(args.p_team_id),
        }),
  news_team_filters: (args) => news.getTeamFilters(language(args)),
  // One entry per edition, as the real RPC answers: an article's French and
  // Arabic editions are two ids, each naming the other. The mock feed gives
  // both languages one id, so the Arabic edition's is derived from it.
  news_sitemap_entries: async () => {
    const { items } = await news.getFeed({ language: "fr", limit: 50 });
    const arabic = (id: string) => `c${id.slice(1)}`;
    return items.flatMap((item) => {
      const dates = { publishedAt: item.publishedAt, contentUpdatedAt: item.updatedAt };
      const fr = { id: item.id, language: "fr" };
      const ar = { id: arabic(item.id), language: "ar" };
      return [
        { ...fr, ...dates, translations: [ar] },
        { ...ar, ...dates, translations: [fr] },
      ];
    });
  },
  predictions_round: (args) =>
    predictions.getRound(
      {
        roundNumber: typeof args.p_round_number === "number" ? args.p_round_number : null,
        language: language(args),
      },
      context,
    ),
  fantasy_hub: () => fantasyHub(),
  // Before the first deadline nothing has scored: no averages, no top
  // players, no season totals. The same state production was in at launch.
  fantasy_gameweek_summary: (args) => ({
    gameweekId: String(args.p_gameweek_id),
    averagePoints: null,
    highestPoints: null,
    teamCount: 0,
    pointsState: "provisional",
  }),
  fantasy_top_players: () => [],
  fantasy_player_pool: () => ({ items: [], nextCursor: null }),
  fantasy_player_season_stats: () => ({
    activeTeamCount: 0,
    formWindow: 5,
    scoredGameweeksInWindow: 0,
    throughGameweekSequence: null,
    items: [],
  }),
  fantasy_prizes: async () => ({ items: await prizes.listPrizes(context) }),
};

function corsHeaders(request: Request): Record<string, string> {
  return {
    "access-control-allow-origin": request.headers.get("origin") ?? "*",
    "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "access-control-allow-headers":
      request.headers.get("access-control-request-headers") ??
      "authorization, apikey, content-type",
    "access-control-max-age": "600",
    vary: "Origin",
  };
}

function json(request: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(request), "content-type": "application/json; charset=utf-8" },
  });
}

export function startStubSupabase(port: number) {
  const unhandled = new Set<string>();

  const server = Bun.serve({
    hostname: "127.0.0.1",
    port,
    async fetch(request) {
      const url = new URL(request.url);
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders(request) });
      }
      if (url.pathname === "/__stub/unhandled") {
        const calls = [...unhandled].sort();
        if (request.method === "DELETE") unhandled.clear();
        return json(request, 200, calls);
      }

      const rpc = url.pathname.match(/^\/rest\/v1\/rpc\/([a-z0-9_]+)$/)?.[1];
      const handler =
        rpc && request.method === "POST" && Object.hasOwn(RPC, rpc) ? RPC[rpc] : undefined;
      if (!handler) {
        const what = `${request.method} ${url.pathname}`;
        unhandled.add(what);
        return json(request, 404, {
          code: "PGRST202",
          message: `The smoke-test stub has no answer for ${what}; add one in tests/e2e/stub-supabase.ts.`,
          details: null,
          hint: null,
        });
      }
      const body = await request.text();
      const args = (body ? JSON.parse(body) : {}) as Args;
      return json(request, 200, await handler(args));
    },
  });

  return { server, unhandled };
}
