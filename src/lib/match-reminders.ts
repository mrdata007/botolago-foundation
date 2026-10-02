// Which matches this device has set a reminder on, per account.
//
// The server keeps the reminder (a match subscription), but it has no call to
// read the list back, so the bell would forget its state on a new phone or
// after the browser's data is cleared. This list is what THIS device set,
// kept so the bell can show its state. Turning a reminder on again is safe
// (the server ignores a repeat), so a lost list costs a tap, not a reminder.

import { useSyncExternalStore } from "react";

const KEY_PREFIX = "botolago:match-reminders:";
const MAX_REMEMBERED = 200;

/** `ids` with `id` added or removed. Newest last, capped, no repeats. */
export function withReminder(ids: readonly string[], id: string, on: boolean): string[] {
  const rest = ids.filter((existing) => existing !== id);
  return on ? [...rest, id].slice(-MAX_REMEMBERED) : rest;
}

const listeners = new Set<() => void>();
const NONE: readonly string[] = [];
const cache = new Map<string, { raw: string | null; ids: readonly string[] }>();

function storageKey(userId: string): string {
  return `${KEY_PREFIX}${userId}`;
}

function read(userId: string): readonly string[] {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(storageKey(userId));
  } catch {
    return NONE;
  }
  const hit = cache.get(userId);
  // The same string gives the same array, so a snapshot read does not loop.
  if (hit && hit.raw === raw) return hit.ids;
  let ids: readonly string[] = NONE;
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) ids = parsed.filter((v): v is string => typeof v === "string");
    } catch {
      ids = NONE;
    }
  }
  cache.set(userId, { raw, ids });
  return ids;
}

/** Records the reminder on this device. Storage that cannot be written is skipped. */
export function rememberReminder(userId: string, fixtureId: string, on: boolean): void {
  try {
    window.localStorage.setItem(
      storageKey(userId),
      JSON.stringify(withReminder(read(userId), fixtureId, on)),
    );
  } catch {
    /* private window or full storage: the bell just will not remember */
  }
  listeners.forEach((listener) => listener());
}

/** Replaces this device's list with what the server says the account has. */
export function replaceReminders(userId: string, ids: readonly string[]): void {
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(ids.slice(0, MAX_REMEMBERED)));
  } catch {
    /* storage unavailable: the bell keeps asking the server */
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Whether this device set a reminder on the match for the account. */
export function useHasReminder(userId: string | null, fixtureId: string): boolean {
  return useSyncExternalStore(
    subscribe,
    () => (userId ? read(userId).includes(fixtureId) : false),
    () => false,
  );
}
