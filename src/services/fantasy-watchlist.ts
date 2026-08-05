import type { AuthStatus } from "@/services/auth";
import type { FantasyDataSource } from "@/services/fantasy-data-source";

export const FANTASY_WATCHLIST_STORAGE_ROOT = "botolago.fantasy.watchlist";

export interface FantasyWatchlistStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function fantasyWatchlistStorageKey(input: {
  source: FantasyDataSource;
  authStatus: AuthStatus;
  userId: string | null | undefined;
}): string | null {
  if (input.authStatus === "loading") return null;

  if (input.authStatus === "authenticated") {
    if (!input.userId) return null;
    return `${FANTASY_WATCHLIST_STORAGE_ROOT}.${input.source}.user.${encodeURIComponent(input.userId)}`;
  }

  return `${FANTASY_WATCHLIST_STORAGE_ROOT}.${input.source}.guest`;
}

export function readFantasyWatchlist(
  storage: Pick<FantasyWatchlistStorage, "getItem"> | null,
  key: string,
): string[] {
  if (!storage) return [];

  try {
    const parsed: unknown = JSON.parse(storage.getItem(key) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.filter((value): value is string => typeof value === "string"))];
  } catch {
    return [];
  }
}

export function writeFantasyWatchlist(
  storage: Pick<FantasyWatchlistStorage, "setItem"> | null,
  key: string,
  ids: readonly string[],
): boolean {
  if (!storage) return false;

  try {
    storage.setItem(key, JSON.stringify(ids));
    return true;
  } catch {
    return false;
  }
}
