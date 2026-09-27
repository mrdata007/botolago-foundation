import type { FantasyHubDto } from "@/backend/fantasy/contracts";
import { supabaseV2 } from "@/integrations/supabase/v2-client";

/**
 * A Fantasy screen asks for its availability, gameweek and players at the
 * same moment, and each of those read `api.fantasy_hub` on its own -- the
 * most-called RPC in production (18,762 calls on 2026-09-24). A read now
 * joins one already in flight, and a resolved read is handed out again for
 * HUB_SHARE_MS after it arrived: the owned snapshot, the availability probe,
 * the gameweek and the player pool of one screen cost one request.
 *
 * The hub carries the caller's own team, so a shared read belongs to the
 * account it was made for (`identity`: the signed-in user's id, or
 * "anonymous") and is only ever handed to a read for that same account. An
 * account switch inside the window therefore reads afresh on its own, before
 * any effect has run; `forgetSharedFantasyHub`, still called on every write
 * and identity change, drops the entry so a read after a write sees it.
 *
 * Browser only: a server process serves many visitors. A failed read is never
 * shared.
 *
 * Its own module so the app-wide owned-Fantasy provider can forget the shared
 * read without importing the Fantasy runtime (and its mock data) itself.
 */
export const HUB_SHARE_MS = 15_000;

let shared: {
  identity: string;
  read: Promise<FantasyHubDto>;
  /** When the read resolved; `null` while it is in flight. */
  settledAt: number | null;
} | null = null;

export function forgetSharedFantasyHub(): void {
  shared = null;
}

export function shareFantasyHub(
  load: () => Promise<FantasyHubDto>,
  {
    identity,
    now = Date.now,
    inBrowser = typeof window !== "undefined",
  }: { identity: string; now?: () => number; inBrowser?: boolean },
): Promise<FantasyHubDto> {
  if (!inBrowser) return load();
  if (
    shared &&
    shared.identity === identity &&
    (shared.settledAt === null || now() - shared.settledAt < HUB_SHARE_MS)
  ) {
    return shared.read;
  }
  const entry: NonNullable<typeof shared> = { identity, read: load(), settledAt: null };
  shared = entry;
  entry.read.then(
    () => {
      entry.settledAt = now();
    },
    () => {
      if (shared === entry) shared = null;
    },
  );
  return entry.read;
}

/**
 * Whose hub a read returns: the account whose session the request will carry.
 * An unreadable session never shares (a fresh identity per call).
 */
export async function readHubIdentity(): Promise<string> {
  try {
    const { data } = await supabaseV2.auth.getSession();
    return data.session?.user.id ?? "anonymous";
  } catch {
    return `unknown:${crypto.randomUUID()}`;
  }
}

/**
 * `shareFantasyHub` for the account whose session the client holds. With
 * `owner`, a read for any other account (the session moved on before this
 * caller heard of it) goes out on its own and is never shared.
 */
export async function readSharedFantasyHub(
  load: () => Promise<FantasyHubDto>,
  {
    owner,
    readIdentity = readHubIdentity,
    now,
    inBrowser = typeof window !== "undefined",
  }: {
    owner?: string;
    readIdentity?: () => Promise<string>;
    now?: () => number;
    inBrowser?: boolean;
  } = {},
): Promise<FantasyHubDto> {
  if (!inBrowser) return load();
  const identity = await readIdentity();
  if (owner !== undefined && identity !== owner) return load();
  return shareFantasyHub(load, { identity, now, inBrowser });
}
