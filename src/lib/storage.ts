// Safe namespaced localStorage helpers with SSR guards.

const PREFIX = "botolago.";

export function readJSON<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/**
 * Like `writeJSON`, but says whether the value reached browser storage. Quota
 * errors and blocked storage (private mode, site data denied) are swallowed
 * either way; this one returns `false` for them, so a screen that promises
 * "kept on this device" can stop promising it. False on the server too: there
 * is no device to keep anything on.
 */
export function tryWriteJSON<T>(key: string, value: T): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    return false;
  }
  try {
    window.dispatchEvent(new CustomEvent("botolago:storage", { detail: { key } }));
  } catch {
    /* the value is stored; only the same-tab notice failed */
  }
  return true;
}

/** Best effort: callers that do not care whether storage worked use this. */
export function writeJSON<T>(key: string, value: T): void {
  tryWriteJSON(key, value);
}

export function removeKey(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(PREFIX + key);
    window.dispatchEvent(new CustomEvent("botolago:storage", { detail: { key } }));
  } catch {
    /* ignore */
  }
}

export const STORAGE_KEYS = {
  FANTASY_TEAM: "fantasy.team",
} as const;
