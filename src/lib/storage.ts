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

export function writeJSON<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
    window.dispatchEvent(new CustomEvent("botolago:storage", { detail: { key } }));
  } catch {
    /* quota / disabled — ignore */
  }
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
