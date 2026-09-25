import type { FantasyHubDto } from "@/backend/fantasy/contracts";

/**
 * A Fantasy screen asks for its availability, gameweek and players at the
 * same moment, and each of those read `api.fantasy_hub` on its own -- the
 * most-called RPC in production (18,762 calls on 2026-09-24). Reads that
 * start within HUB_SHARE_MS of each other now share one request.
 *
 * The hub carries the caller's own team, so a shared read belongs to the
 * account it was made for (`identity`: the signed-in user's id, or
 * "anonymous") and is only ever handed to a read for that same account. An
 * account switch inside the window therefore reads afresh on its own, before
 * any effect has run; `forgetSharedFantasyHub`, still called on every write
 * and identity change, only saves the old entry's memory.
 *
 * Browser only: a server process serves many visitors. A failed read is never
 * shared.
 *
 * Its own module so the app-wide owned-Fantasy provider can forget the shared
 * read without importing the Fantasy runtime (and its mock data) itself.
 */
export const HUB_SHARE_MS = 2_000;

let shared: { at: number; identity: string; read: Promise<FantasyHubDto> } | null = null;

export function forgetSharedFantasyHub(): void {
  shared = null;
}

export function shareFantasyHub(
  load: () => Promise<FantasyHubDto>,
  {
    identity,
    now = Date.now(),
    inBrowser = typeof window !== "undefined",
  }: { identity: string; now?: number; inBrowser?: boolean },
): Promise<FantasyHubDto> {
  if (!inBrowser) return load();
  if (shared && shared.identity === identity && now - shared.at < HUB_SHARE_MS) {
    return shared.read;
  }
  const entry = { at: now, identity, read: load() };
  shared = entry;
  entry.read.catch(() => {
    if (shared === entry) shared = null;
  });
  return entry.read;
}
