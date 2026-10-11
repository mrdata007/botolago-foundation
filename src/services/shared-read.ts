/**
 * Reads of public season data that several screens' queries start at the same
 * moment share one request.
 *
 * Measured 2026-10-11 on /fantasy/top-players: the screen's three queries each
 * walked the whole player pool (eight serial pages of 100 behind a statistics
 * read) and each asked for the gameweek list, so 20 of its 36 Supabase calls
 * were an identical call made a second or third time. The queries are
 * separate on purpose (different keys, different screens), so the sharing
 * lives under them, where the request is made.
 *
 * Same idea as `fantasy-hub-share.ts`, for data that does not belong to an
 * account: the player pool and the gameweek list read the same for everyone.
 * A read that starts within SHARED_READ_MS of the last one for the same key
 * gets that read's result. A failed read is never shared, and on the server
 * (one process serving many visitors) nothing is shared at all.
 */
export const SHARED_READ_MS = 5_000;

const reads = new Map<string, { at: number; read: Promise<unknown> }>();

export function forgetSharedReads(): void {
  reads.clear();
}

export function shareRead<T>(
  key: string,
  load: () => Promise<T>,
  {
    now = Date.now(),
    inBrowser = typeof window !== "undefined",
  }: { now?: number; inBrowser?: boolean } = {},
): Promise<T> {
  if (!inBrowser) return load();
  const held = reads.get(key);
  if (held && now - held.at < SHARED_READ_MS) return held.read as Promise<T>;
  const entry = { at: now, read: load() };
  reads.set(key, entry);
  entry.read.catch(() => {
    if (reads.get(key) === entry) reads.delete(key);
  });
  return entry.read as Promise<T>;
}
