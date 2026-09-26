import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import {
  accountApi,
  accountReadFailure,
  NOT_AUTHENTICATED_TEXT,
  toolError,
  type McpTextResult,
} from "../account-read";

export const PROFILE_UNAVAILABLE_TEXT = "Your BotolaGO profile is temporarily unavailable.";

/**
 * The answer to a read of `api.my_profile`, the caller's own row or none. An
 * account with two-step sign-in gets the database's refusal instead (see
 * `../account-read`), and the tool says why.
 *
 * Until 2026-09-25 the tool read `profiles` in the `public` schema, which does
 * not exist here (the Data API exposes `api` only), so it answered every
 * account with PostgREST's error text.
 */
export function profileResult(result: { data: unknown; error: unknown }): McpTextResult {
  if (result.error) return accountReadFailure(result.error, PROFILE_UNAVAILABLE_TEXT);
  const profile = (result.data ?? null) as Record<string, unknown> | null;
  return {
    content: [{ type: "text", text: JSON.stringify(profile ?? {}) }],
    structuredContent: { profile },
  };
}

export default defineTool({
  name: "get_profile",
  title: "Get my profile",
  description:
    "Returns the signed-in BotolaGO user's profile (username, display name, favorite club, preferred language). An account that uses two-step sign-in does not share it with connected apps.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx: ToolContext) => {
    if (!ctx.isAuthenticated()) return toolError(NOT_AUTHENTICATED_TEXT);
    try {
      return profileResult(
        await accountApi(ctx)
          .from("my_profile")
          .select("username, display_name, favorite_club_id, preferred_language")
          .maybeSingle(),
      );
    } catch (error) {
      return accountReadFailure(error, PROFILE_UNAVAILABLE_TEXT);
    }
  },
});
