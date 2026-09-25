// What the MCP tools that read the signed-in account's own data share: the
// Data API as that account, and their answers when a read fails.
//
// Those tools act with the OAuth access token the MCP client obtained from
// Supabase Auth's OAuth 2.1 server. Its claims are a session token's (`sub`,
// `role`, `aal`, `amr`, `session_id`) plus `client_id`, and its `aal` is
// `aal1`: exchanging the authorization code starts a new session whose only
// authentication method is `oauth_provider/authorization_code`, which Supabase
// Auth does not count as a second factor (supabase/auth,
// internal/api/oauthserver/handlers.go `handleAuthorizationCodeGrant` ->
// `tokens.Service.IssueRefreshToken` -> `Session.CalculateAALAndAMR`; a refresh
// keeps the session's level). That holds even when the person approved the
// connection from a session that had entered its code; only a client that ran
// the MFA challenge itself with that token would reach `aal2`, and MCP clients
// do not. Since 20260926003100 the database refuses an account's own data to
// an `aal1` session of an account with a verified factor (`PT403
// mfa_required`). So for an account that turned two-step sign-in on, these
// tools always get that refusal, and say so plainly. Accounts without a second
// factor are not affected.

import { createClient } from "@supabase/supabase-js";
import type { ToolContext } from "@lovable.dev/mcp-js";
import { isMfaStepUpError } from "@/backend/auth/step-up";
import type { Database } from "@/backend/generated/database.types";

/** The answer to a request that carries no verified token. */
export const NOT_AUTHENTICATED_TEXT = "Not authenticated";

/**
 * The answer to an account with two-step sign-in, whose data the database
 * keeps from sessions that have not entered the code -- which a connected app's
 * session never has.
 */
export const MFA_REQUIRED_TEXT =
  "This BotolaGO account uses two-step sign-in, so its own data is only shown " +
  "to a session that has entered the one-time code. Connected apps sign in " +
  "without that code, so BotolaGO does not share this account's data with them. " +
  "The account holder can see it on botolago.com after signing in with the code.";

export interface McpTextResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: true;
  structuredContent?: Record<string, unknown>;
}

export function toolError(text: string): McpTextResult {
  return { content: [{ type: "text", text }], isError: true };
}

/**
 * A failed read, for the MCP client: the two-step sign-in refusal as such
 * (`PT403 mfa_required`, whatever wraps it), anything else as `unavailable`.
 * The database's own message is never passed on.
 */
export function accountReadFailure(error: unknown, unavailable: string): McpTextResult {
  return toolError(isMfaStepUpError(error) ? MFA_REQUIRED_TEXT : unavailable);
}

/**
 * The `api` schema -- the only one the Data API exposes -- as the account the
 * tool call's token belongs to. Every read through it is scoped to that
 * account by the database (auth.uid()), not by the tool.
 */
export function accountApi(ctx: ToolContext) {
  return createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  }).schema("api");
}
