import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * BG-0029 (RC-2) — league cleanup for the authenticated Fantasy journey suite.
 *
 * The league test creates one private league per run through the UI and the
 * UI offers the owner no removal path (the leave-league RPC refuses the
 * owner). `api.archive_fantasy_league` is the only owner-side removal contract
 * the API exposes: it soft-deletes (`active = false`) so the league disappears
 * from listings, standings and the scoring worker.
 *
 * Everything here runs in the Playwright process with the synthetic manager's
 * own credentials (no service role). Nothing is executed at import time; the
 * suite only calls `createLeagueCleanup` when the credentials are injected.
 * Emails, passwords, tokens and keys are never logged or attached.
 */

export const E2E_LEAGUE_NAME_PREFIX = "E2E Ligue ";

const LEAGUE_ID_PATTERN = /\/fantasy\/leagues\/([0-9a-f-]{36})/;

type LeagueListItem = { id?: unknown; name?: unknown; role?: unknown };
type HubResponse = { season?: { id?: unknown } | null; team?: { id?: unknown } | null };

export type LeagueCleanupCredentials = { email: string; password: string };

export type LeagueCleanup = {
  /** Archive one league owned by the synthetic manager; throws when the RPC fails. */
  archiveLeague(leagueId: string): Promise<void>;
  /** Archive every owner-role private league whose name starts with `E2E Ligue `; returns the ids archived. */
  sweepE2ELeagues(): Promise<string[]>;
  /** Sign the helper client out; safe to call more than once. */
  dispose(): Promise<void>;
};

/** Extract the league id from a `/fantasy/leagues/<uuid>` URL, or null. */
export function leagueIdFromUrl(url: string): string | null {
  return LEAGUE_ID_PATTERN.exec(url)?.[1] ?? null;
}

function requireEnv(name: "VITE_SUPABASE_URL" | "VITE_SUPABASE_PUBLISHABLE_KEY"): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is required for Fantasy league cleanup; refusing to run the league test without it.`,
    );
  }
  return value;
}

function asId(value: unknown, what: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`League cleanup could not resolve the ${what}.`);
  }
  return value;
}

function isSweepCandidate(
  item: LeagueListItem,
): item is { id: string; name: string; role: string } {
  return (
    typeof item.id === "string" &&
    typeof item.name === "string" &&
    item.role === "owner" &&
    item.name.startsWith(E2E_LEAGUE_NAME_PREFIX)
  );
}

/**
 * Build a cleanup handle authenticated as the synthetic manager.
 * Resolves the season and team ids from `api.fantasy_hub` once.
 */
export async function createLeagueCleanup(
  credentials: LeagueCleanupCredentials,
): Promise<LeagueCleanup> {
  const url = requireEnv("VITE_SUPABASE_URL");
  const key = requireEnv("VITE_SUPABASE_PUBLISHABLE_KEY");
  const client: SupabaseClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const signIn = await client.auth.signInWithPassword(credentials);
  if (signIn.error) {
    throw new Error(`League cleanup sign-in failed: ${signIn.error.message}`);
  }

  const api = client.schema("api");
  const hub = await api.rpc("fantasy_hub", { p_language: "fr" });
  if (hub.error) throw new Error(`League cleanup fantasy_hub failed: ${hub.error.message}`);
  const hubData = (hub.data ?? {}) as HubResponse;
  const seasonId = asId(hubData.season?.id, "season id");
  const teamId = asId(hubData.team?.id, "synthetic manager's team id");

  async function archiveLeague(leagueId: string): Promise<void> {
    const result = await api.rpc("archive_fantasy_league", {
      p_league_id: leagueId,
      p_team_id: teamId,
    });
    if (result.error) {
      throw new Error(`archive_fantasy_league(${leagueId}) failed: ${result.error.message}`);
    }
    if (result.data !== true) {
      throw new Error(`archive_fantasy_league(${leagueId}) did not return true.`);
    }
  }

  async function sweepE2ELeagues(): Promise<string[]> {
    const listed = await api.rpc("fantasy_leagues", {
      p_season_id: seasonId,
      p_visibility: "private",
      p_limit: 100,
    });
    if (listed.error) {
      throw new Error(`League sweep fantasy_leagues failed: ${listed.error.message}`);
    }
    const items = ((listed.data as { items?: unknown } | null)?.items ?? []) as LeagueListItem[];
    const archived: string[] = [];
    for (const item of items) {
      if (!isSweepCandidate(item)) continue;
      await archiveLeague(item.id);
      archived.push(item.id);
    }
    return archived;
  }

  async function dispose(): Promise<void> {
    await client.auth.signOut({ scope: "local" }).catch(() => undefined);
  }

  return { archiveLeague, sweepE2ELeagues, dispose };
}
