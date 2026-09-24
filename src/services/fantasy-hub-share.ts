import type { FantasyHubDto } from "@/backend/fantasy/contracts";

/**
 * A Fantasy screen asks for its availability, gameweek and players at the
 * same moment, and each of those read `api.fantasy_hub` on its own -- the
 * most-called RPC in production (18,762 calls on 2026-09-24). Reads that
 * start within HUB_SHARE_MS of each other now share one request.
 *
 * Browser only: a server process serves many visitors and the hub carries the
 * caller's team. A failed read is never shared, and every write path and
 * identity change calls `forgetSharedFantasyHub` so the screen after a save
 * or a sign-in reads afresh.
 *
 * Its own module so the app-wide owned-Fantasy provider can forget the shared
 * read without importing the Fantasy runtime (and its mock data) itself.
 */
export const HUB_SHARE_MS = 2_000;

let shared: { at: number; read: Promise<FantasyHubDto> } | null = null;

export function forgetSharedFantasyHub(): void {
  shared = null;
}

export function shareFantasyHub(
  load: () => Promise<FantasyHubDto>,
  { now = Date.now(), inBrowser = typeof window !== "undefined" } = {},
): Promise<FantasyHubDto> {
  if (!inBrowser) return load();
  if (shared && now - shared.at < HUB_SHARE_MS) return shared.read;
  const entry = { at: now, read: load() };
  shared = entry;
  entry.read.catch(() => {
    if (shared === entry) shared = null;
  });
  return entry.read;
}
