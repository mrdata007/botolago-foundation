import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { fantasyHubSchema, type FantasyTeamDto } from "@/backend/fantasy/contracts";
import {
  accountApi,
  accountReadFailure,
  NOT_AUTHENTICATED_TEXT,
  toolError,
  type McpTextResult,
} from "../account-read";

export const FANTASY_UNAVAILABLE_TEXT = "Fantasy data is temporarily unavailable.";
export const NO_FANTASY_TEAM_TEXT = "No fantasy team yet — create one in the BotolaGO app first.";
export const NO_FANTASY_SEASON_TEXT = "No BotolaGO Fantasy season is open right now.";

/** Starters by line, goalkeeper left out: "4-4-2". Null without a full XI. */
function formationOf(team: FantasyTeamDto): string | null {
  const positions = new Map(team.squad.map((member) => [member.fantasyPlayerId, member.position]));
  const lines = { DEF: 0, MID: 0, FWD: 0 };
  let starters = 0;
  for (const pick of team.lineup) {
    if (pick.slot !== "starter") continue;
    starters += 1;
    const position = positions.get(pick.fantasyPlayerId);
    if (position === "DEF" || position === "MID" || position === "FWD") lines[position] += 1;
  }
  return starters === 11 ? `${lines.DEF}-${lines.MID}-${lines.FWD}` : null;
}

/**
 * The answer to `api.fantasy_hub`: the current season, its gameweek and the
 * caller's own team in it. An account with two-step sign-in gets the
 * database's refusal instead (see `../account-read`), and the tool says why.
 *
 * Until 2026-09-25 the tool read `fantasy_teams` in the `public` schema, which
 * does not exist here (the Data API exposes `api` only), so it answered every
 * account with PostgREST's error text.
 */
export function fantasyTeamResult(result: { data: unknown; error: unknown }): McpTextResult {
  if (result.error) {
    const message = (result.error as { message?: unknown }).message;
    if (message === "fantasy_season_closed")
      return { content: [{ type: "text", text: NO_FANTASY_SEASON_TEXT }] };
    return accountReadFailure(result.error, FANTASY_UNAVAILABLE_TEXT);
  }
  const hub = fantasyHubSchema.safeParse(result.data);
  if (!hub.success) return toolError(FANTASY_UNAVAILABLE_TEXT);
  const { season, gameweek, team } = hub.data;
  if (!team) return { content: [{ type: "text", text: NO_FANTASY_TEAM_TEXT }] };
  const summary = {
    teamName: team.name,
    season: season.name,
    formation: formationOf(team),
    bank: team.bank,
    teamValue: team.teamValue,
    freeTransfers: team.freeTransfers,
    currentGameweek: gameweek
      ? { number: gameweek.sequence, name: gameweek.name, deadlineAt: gameweek.deadlineAt }
      : null,
    updatedAt: team.updatedAt,
  };
  return {
    content: [{ type: "text", text: JSON.stringify(summary) }],
    structuredContent: { team: summary },
  };
}

export default defineTool({
  name: "get_fantasy_team",
  title: "Get my fantasy team",
  description:
    "Returns the signed-in user's BotolaGO fantasy team summary for the current season: team name, formation, bank, team value, free transfers, and current gameweek. An account that uses two-step sign-in does not share it with connected apps.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx: ToolContext) => {
    if (!ctx.isAuthenticated()) return toolError(NOT_AUTHENTICATED_TEXT);
    try {
      return fantasyTeamResult(await accountApi(ctx).rpc("fantasy_hub", { p_language: "fr" }));
    } catch (error) {
      return accountReadFailure(error, FANTASY_UNAVAILABLE_TEXT);
    }
  },
});
