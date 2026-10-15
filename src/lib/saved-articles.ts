import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/auth/AuthProvider";
import { getNewsDataMode, newsService } from "@/services/news";
import { toast } from "sonner";
import { showStepUpNotice } from "@/auth/step-up-notice";
import { isMfaStepUpError } from "@/backend/auth/step-up";
import type { TranslationKey } from "@/i18n/dictionaries";
import { useI18n } from "@/i18n/provider";
import { NEWS_ENABLED } from "@/lib/feature-flags";
import {
  mergeSavedSnapshot,
  savedCollectionQueryKey,
  planSavedToggle,
  savedStateOf,
  withSavedState,
  type SavedIdsSnapshot,
} from "@/lib/saved-collection";

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
  const { t, lang } = useI18n();
  const accountKey = user?.id ?? "anonymous";
  const queryKey = useMemo(() => ["news", "saved-article-ids", accountKey] as const, [accountKey]);
  const [localIds, setLocalIds] = useState<string[]>([]);
  const [localHydrated, setLocalHydrated] = useState(false);
  // Stories whose saved state is being asked of the server (see `toggle`), so a
  // second tap cannot start a second check.
  const checking = useRef(new Set<string>());

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
    queryFn: async (): Promise<SavedIdsSnapshot> =>
      mergeSavedSnapshot(
        await newsService.getSavedIds(),
        queryClient.getQueryData<SavedIdsSnapshot>(queryKey),
      ),
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
      const previous = queryClient.getQueryData<SavedIdsSnapshot>(queryKey);
      // Without a read list there is nothing to update; the refetch after the
      // write brings the real one.
      if (previous) queryClient.setQueryData(queryKey, withSavedState(previous, id, !saved));
      return { previous };
    },
    onError: (error, { saved }, rollback) => {
      if (rollback?.previous) queryClient.setQueryData(queryKey, rollback.previous);
      reportSavedMutationFailure(error, saved, t);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey });
      // The collection page reads the same saves; refetch it so an unsave
      // (or a save from a card) is what the server now says.
      void queryClient.invalidateQueries({ queryKey: savedCollectionQueryKey(user?.id ?? null) });
    },
  });

  const snapshot = mode === "mock" ? undefined : cloud.data;
  const ids = useMemo(
    () => (mode === "mock" ? localIds : (snapshot?.ids ?? [])),
    [snapshot, localIds, mode],
  );
  // The device list is always whole; the account list is whole unless the
  // account has more saves than the app reads (2,000).
  const complete = mode === "mock" ? true : (snapshot?.complete ?? true);
  const removed = snapshot?.removed;
  /**
   * Whether a story is saved. `serverSaved` is the answer that came with the
   * story (`Article.isSaved`); it is used only when the ids are partial and
   * the story is not among them, where the ids cannot say.
   */
  const isSaved = useCallback(
    (id: string, serverSaved?: boolean) =>
      mode === "mock" ? ids.includes(id) : savedStateOf(snapshot, id, serverSaved) === true,
    [ids, mode, snapshot],
  );
  const toggle = useCallback(
    (id: string) => {
      if (mode === "mock") {
        const current = readLocal();
        writeLocal(
          current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
        );
        return;
      }
      requireAuth(
        () => {
          // The ids answer for this story when they are the whole list or
          // name it. Otherwise (more than 2,000 saves, or not read yet) ask
          // the server first: guessing "not saved" would save a story the
          // reader meant to remove.
          const plan = planSavedToggle(queryClient.getQueryData<SavedIdsSnapshot>(queryKey), id);
          if (plan !== "ask") {
            mutation.mutate({ id, saved: plan === "unsave" });
            return;
          }
          if (checking.current.has(id)) return;
          checking.current.add(id);
          newsService
            .isArticleSaved(id, lang)
            .then((saved) => mutation.mutate({ id, saved }))
            .catch((error: unknown) => reportSavedMutationFailure(error, false, t))
            .finally(() => checking.current.delete(id));
        },
        { reason: "Connectez-vous pour enregistrer cet article." },
      );
    },
    [lang, mode, mutation, queryClient, queryKey, requireAuth, t],
  );

  return {
    ids,
    complete,
    removed,
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
