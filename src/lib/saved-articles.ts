import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/auth/AuthProvider";
import { getNewsDataMode, newsService } from "@/services/news";
import { toast } from "sonner";
import { showStepUpNotice } from "@/auth/step-up-notice";
import { isMfaStepUpError } from "@/backend/auth/step-up";
import type { TranslationKey } from "@/i18n/dictionaries";
import { useI18n } from "@/i18n/provider";
import { NEWS_ENABLED } from "@/lib/feature-flags";
import { savedCollectionQueryKey } from "@/lib/saved-collection";

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

/**
 * Says why a save or an unsave did not go through. The bookmark that was
 * toggled rolls back by itself and is the way to try again; this is the
 * message that explains why it came back. A refusal for want of the one-time
 * code gets the auth layer's notice instead (one toast, never two).
 */
export function reportSavedMutationFailure(
  error: unknown,
  wasSaved: boolean,
  t: (key: TranslationKey) => string,
  notify: {
    stepUp: (t: (key: TranslationKey) => string) => void;
    error: (message: string) => void;
  } = {
    stepUp: showStepUpNotice,
    error: (message) => void toast.error(message),
  },
): void {
  if (isMfaStepUpError(error)) notify.stepUp(t);
  else notify.error(wasSaved ? t("news.saved.remove_error") : t("news.saved.save_error"));
}

export function useSavedArticles(options: { fresh?: boolean } = {}) {
  const mode = getNewsDataMode();
  const { user, status, requireAuth } = useAuth();
  const queryClient = useQueryClient();
  const { t } = useI18n();
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
    // `fresh` (the collection page): always re-read on mount.
    staleTime: options.fresh ? 0 : 30_000,
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
    onError: (error, { saved }, rollback) => {
      if (rollback) queryClient.setQueryData(queryKey, rollback.previous);
      reportSavedMutationFailure(error, saved, t);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey });
      // The collection page reads the same saves; refetch it so an unsave
      // (or a save from a card) is what the server now says.
      void queryClient.invalidateQueries({ queryKey: savedCollectionQueryKey(user?.id ?? null) });
    },
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
    // True once `ids` is the reader's real list, not the empty one a failed or
    // not-yet-started read leaves behind (`hydrated` is also true after a
    // failure). The collection hides unsaved stories only when this holds.
    idsKnown: mode === "mock" ? localHydrated : cloud.data !== undefined,
    pending: mutation.isPending,
  };
}
