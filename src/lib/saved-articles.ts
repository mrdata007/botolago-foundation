import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/auth/AuthProvider";
import { getNewsDataMode, newsService } from "@/services/news";
import { NEWS_ENABLED } from "@/lib/feature-flags";

// Device-local persistence exists only in explicit preview/mock mode. Supabase
// mode is server-authoritative and never falls back to these values.
const STORAGE_KEY = "botolago.savedArticles";
type Listener = (ids: string[]) => void;
const listeners = new Set<Listener>();
let cached: string[] | null = null;

function readLocal(): string[] {
  if (cached) return cached;
  if (typeof window === "undefined") return (cached = []);
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]") as unknown;
    cached = Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    cached = [];
  }
  return cached;
}

function writeLocal(next: string[]): void {
  cached = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Preview persistence is best-effort. Production never uses this path.
  }
  listeners.forEach((listener) => listener(next));
}

export function useSavedArticles() {
  const mode = getNewsDataMode();
  const { user, status, requireAuth } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = ["news", "saved-article-ids", user?.id ?? "anonymous"] as const;
  const [localIds, setLocalIds] = useState<string[]>([]);
  const [localHydrated, setLocalHydrated] = useState(false);

  useEffect(() => {
    if (mode !== "mock") return;
    setLocalIds(readLocal());
    setLocalHydrated(true);
    const listener: Listener = (next) => setLocalIds(next);
    listeners.add(listener);
    return () => void listeners.delete(listener);
  }, [mode]);

  // The hook itself must keep being callable unconditionally (rules of
  // hooks), but while News is hidden (owner decision — see
  // `@/lib/feature-flags`) nothing renders a saved count, so the saved-ids
  // RPC must not be issued from /profile either.
  const cloud = useQuery({
    queryKey,
    queryFn: () => newsService.getSavedIds(),
    enabled: NEWS_ENABLED && mode === "supabase" && status === "authenticated",
    staleTime: 30_000,
  });

  const mutation = useMutation({
    mutationFn: async ({ id, saved }: { id: string; saved: boolean }) => {
      if (saved) await newsService.unsave(id);
      else await newsService.save(id);
    },
    onMutate: async ({ id, saved }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<string[]>(queryKey) ?? [];
      queryClient.setQueryData<string[]>(
        queryKey,
        saved ? previous.filter((value) => value !== id) : [...new Set([...previous, id])],
      );
      return { previous };
    },
    onError: (_error, _variables, rollback) => {
      if (rollback) queryClient.setQueryData(queryKey, rollback.previous);
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey }),
  });

  const ids = useMemo(
    () => (mode === "mock" ? localIds : (cloud.data ?? [])),
    [cloud.data, localIds, mode],
  );
  const isSaved = useCallback((id: string) => ids.includes(id), [ids]);
  const toggle = useCallback(
    (id: string) => {
      if (mode === "mock") {
        const current = readLocal();
        writeLocal(
          current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
        );
        return;
      }
      requireAuth(() => mutation.mutate({ id, saved: ids.includes(id) }), {
        reason: "Connectez-vous pour enregistrer cet article.",
      });
    },
    [ids, mode, mutation, requireAuth],
  );

  return {
    ids,
    isSaved,
    toggle,
    hydrated: mode === "mock" ? localHydrated : status !== "loading" && !cloud.isLoading,
    pending: mutation.isPending,
  };
}
