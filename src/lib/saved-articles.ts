import { useCallback, useEffect, useState } from "react";

/**
 * Local-only saved-article store. SSR-safe: reads happen after mount so
 * initial render never diverges between server and client. Persistence
 * is scoped to a namespaced key and is intentionally decoupled from the
 * Supabase cloud (this is a client-side reading list bookmark).
 */
const STORAGE_KEY = "botolago.savedArticles";

type Listener = (ids: string[]) => void;
const listeners = new Set<Listener>();
let cached: string[] | null = null;

function read(): string[] {
  if (cached) return cached;
  if (typeof window === "undefined") return (cached = []);
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    cached = Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    cached = [];
  }
  return cached;
}

function write(next: string[]) {
  cached = next;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch { /* ignore quota */ }
  }
  listeners.forEach((fn) => fn(next));
}

export function useSavedArticles() {
  const [ids, setIds] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setIds(read());
    setHydrated(true);
    const listener: Listener = (next) => setIds(next);
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, []);

  const toggle = useCallback((id: string) => {
    const current = read();
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    write(next);
  }, []);

  const isSaved = useCallback((id: string) => ids.includes(id), [ids]);

  return { ids, isSaved, toggle, hydrated };
}
