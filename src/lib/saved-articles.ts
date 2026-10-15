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
import type { Language } from "@/types/domain";
import {
  mergeSavedSnapshot,
  savedCollectionQueryKey,
  planSavedToggle,
  resolveAskedToggle,
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
  // The account as of the latest render, so a tap that waited on the server can
  // tell whether the reader switched account while it waited.
  const accountRef = useRef(accountKey);
  accountRef.current = accountKey;

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
    },
    onError: (error, { id, saved }) => {
      // Put back this one story only: other taps may have changed the list
      // since, and restoring the whole earlier snapshot would undo them.
      queryClient.setQueryData<SavedIdsSnapshot | undefined>(queryKey, (current) =>
        current ? withSavedState(current, id, saved) : current,
      );
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
  /**
   * A tap on a story's bookmark. `shown` is the state the bookmark displayed
   * (what the reader saw), so the tap means "the opposite of that". `language`
   * is the story's own edition language, for the server read below.
   */
  const toggle = useCallback(
    (id: string, options: { shown?: boolean; language?: Language } = {}) => {
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
          const accountAtTap = accountKey;
          const shown = options.shown ?? false;
          newsService
            .isArticleSaved(id, options.language ?? lang)
            .then((serverSaved) => {
              // Another account signed in while the server answered: its
              // answer is about the previous reader.
              if (accountRef.current !== accountAtTap) return;
              const next = resolveAskedToggle(shown, serverSaved);
              if (!next.write) {
                // The server already holds what the reader asked for (the
                // bookmark was drawn from an out-of-date answer). Record the
                // truth so the button shows it; a write would do the reverse
                // of the tap.
                queryClient.setQueryData<SavedIdsSnapshot | undefined>(queryKey, (current) =>
                  current ? withSavedState(current, id, serverSaved) : current,
                );
                return;
              }
              mutation.mutate({ id, saved: next.saved });
            })
            .catch((error: unknown) => reportSavedMutationFailure(error, false, t))
            .finally(() => checking.current.delete(id));
        },
        { reason: "Connectez-vous pour enregistrer cet article." },
      );
    },
    [accountKey, lang, mode, mutation, queryClient, queryKey, requireAuth, t],
  );

  /**
   * Take a story out of the collection. Every row of the Saved page is saved
   * by the server's own list, so this is an explicit unsave, never a toggle.
   */
  const unsave = useCallback(
    (id: string) => {
      if (mode === "mock") {
        writeLocal(readLocal().filter((value) => value !== id));
        return;
      }
      requireAuth(() => mutation.mutate({ id, saved: true }), {
        reason: "Connectez-vous pour enregistrer cet article.",
      });
    },
    [mode, mutation, requireAuth],
  );

  return {
    ids,
    complete,
    removed,
    isSaved,
    toggle,
    unsave,
    hydrated: mode === "mock" ? localHydrated : status !== "loading" && !cloud.isLoading,
    // True once `ids` is the reader's real list, not the empty one a failed or
    // not-yet-started read leaves behind (`hydrated` is also true after a
    // failure). The collection hides unsaved stories only when this holds.
    idsKnown: mode === "mock" ? localHydrated : cloud.data !== undefined,
    pending: mutation.isPending,
  };
}
