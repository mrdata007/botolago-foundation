import { useCallback, useEffect, useState } from "react";

/**
 * The player watchlist: a per-device list of fantasy player ids.
 *
 * It lived inline in the players screen, so the "Ajouter à la liste" button on
 * Top Players had nothing to call -- it shipped with no onClick at all and did
 * nothing when pressed. Sharing one implementation is what stops a second
 * screen from growing a second, differently-broken copy.
 *
 * This is deliberately device-local. Nothing about a watchlist needs a round
 * trip, and storing it server-side would make an anonymous visitor's list
 * either impossible or a reason to demand an account.
 */
const WATCHLIST_KEY = "botolago.fantasy.watchlist";

/**
 * Reads a stored value defensively. Anything can end up under a localStorage
 * key -- an older format, a half-written value, another tab's experiment -- and
 * a watchlist that throws on read would take the whole screen down with it.
 */
export function parseWatchlist(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is string => typeof entry === "string");
  } catch {
    return [];
  }
}

export function toggleWatchlistEntry(ids: readonly string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((entry) => entry !== id) : [...ids, id];
}

export function readWatchlist(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return parseWatchlist(window.localStorage.getItem(WATCHLIST_KEY));
  } catch {
    // Private browsing, blocked site data, a storage quota -- all of which
    // throw on access rather than returning null.
    return [];
  }
}

export function writeWatchlist(ids: readonly string[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(WATCHLIST_KEY, JSON.stringify(ids));
  } catch {
    /* the list is a convenience; failing to persist it must not break the page */
  }
}

/**
 * The watchlist as React state.
 *
 * It starts empty and loads in an effect rather than reading storage during
 * the first render. The server has no localStorage, so seeding state from it
 * would make the client's first render disagree with the server's markup and
 * produce a hydration mismatch -- React then throws away the server tree and
 * the list flickers in.
 */
export function useWatchlist() {
  const [ids, setIds] = useState<string[]>([]);

  useEffect(() => {
    setIds(readWatchlist());
  }, []);

  const toggle = useCallback((id: string) => {
    setIds((current) => {
      const next = toggleWatchlistEntry(current, id);
      writeWatchlist(next);
      return next;
    });
  }, []);

  const isWatched = useCallback((id: string) => ids.includes(id), [ids]);

  return { ids, isWatched, toggle };
}
