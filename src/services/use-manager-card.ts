import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
  type UseInfiniteQueryResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import { useCallback } from "react";

import { useAuth } from "@/auth/AuthProvider";
import type { HistoryResponse, MemberCardDto, MyCardDto } from "@/backend/manager-card/contracts";
import { ManagerCardError, mapManagerCardError } from "@/backend/manager-card/errors";
import { readAckedMoments, rememberAckedMoments } from "@/components/manager-card/storage";
import { useFantasyOwned } from "@/services/fantasy-owned-provider";
import { shouldRetryQuery } from "@/services/query-client";
import { managerCardService } from "./manager-card";
import { isManagerCardSampleData } from "./manager-card-mode";
import { markManagerCardOff, useManagerCardLive } from "./manager-card-status";

/**
 * The Manager Card's React Query hooks (plan section 7.4). Nothing here runs unless the section
 * is live (`useManagerCardLive`), so with the build switch off none of them issues a request.
 * Any card read that answers `{ available: false }` flips the cached status off
 * (`markManagerCardOff`) and fails with `unavailable`, so the section redirects on the next
 * navigation.
 */
export const managerCardKeys = {
  status: ["manager-card", "status"] as const,
  me: (userId: string) => ["manager-card", "me", userId] as const,
  cards: (teamIds: readonly string[]) =>
    ["manager-card", "cards", [...teamIds].sort().join(",")] as const,
  history: (userId: string, seasonId: string | null) =>
    ["manager-card", "history", userId, seasonId] as const,
};

/** One page of the history read. */
export type HistoryPage = Extract<HistoryResponse, { available: true }>;
export const HISTORY_PAGE_SIZE = 20;

const NO_RETRY: ReadonlySet<string> = new Set([
  "unavailable",
  "unauthenticated",
  "mfa_required",
  "not_found",
  "invalid_request",
]);

/**
 * One retry for a dropped connection (the app's rule), none for an answer a second try cannot
 * change, and none at all for development fixtures, so an `offline` fixture shows its error at once.
 */
function retryCardRead(failureCount: number, error: unknown): boolean {
  if (isManagerCardSampleData()) return false;
  if (error instanceof ManagerCardError && NO_RETRY.has(error.code)) return false;
  return shouldRetryQuery(failureCount, error);
}

/** The scope a device-cached acknowledgement belongs to: the account, or the mock login's `local`. */
function ackScope(userId: string | null): string {
  return userId ?? "local";
}

/**
 * Whether the card may be read now: the section is live, someone is signed in, and the Fantasy
 * screen has a team (a guest or a no-team account never issues a read, so no read can answer 404).
 */
function useCardAccess(): { enabled: boolean; userId: string | null } {
  const live = useManagerCardLive();
  const { status, user } = useAuth();
  const owned = useFantasyOwned();
  const hasTeam = !!owned.snapshot?.team && owned.snapshot.team.squad.length > 0;
  const enabled =
    live && status === "authenticated" && !!user && owned.source !== "guest" && hasTeam;
  return { enabled, userId: user?.id ?? null };
}

/**
 * The signed-in manager's card for this season, or `null` when they have no card. Enabled only
 * when live, signed in and the Fantasy screen has a team. 60 s stale, refetched on focus.
 *
 * Moments this phone has already acknowledged are filtered out of `moments`, so nothing flashes
 * back while an acknowledgement is in flight; and a read that still lists one the phone has
 * acknowledged (its call failed) sends the acknowledgement again, silently: a failed ack is
 * retried on the next visit.
 */
export function useMyManagerCard(): UseQueryResult<MyCardDto | null, ManagerCardError> {
  const queryClient = useQueryClient();
  const { enabled, userId } = useCardAccess();
  const scope = ackScope(userId);
  return useQuery<MyCardDto | null, ManagerCardError>({
    queryKey: managerCardKeys.me(scope),
    enabled,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    retry: retryCardRead,
    queryFn: async ({ signal }) => {
      let answer;
      try {
        answer = await managerCardService.myCard(signal);
      } catch (error) {
        throw mapManagerCardError(error);
      }
      if (!answer.available) {
        markManagerCardOff(queryClient);
        throw new ManagerCardError("unavailable", "The Manager Card is switched off.");
      }
      const card = answer.card;
      if (card) {
        const acknowledged = new Set(readAckedMoments(scope));
        const again = card.moments
          .map((moment) => moment.key)
          .filter((key) => acknowledged.has(key));
        if (again.length > 0)
          void managerCardService.ackMoments(again.slice(0, 16)).catch(() => {});
      }
      return card;
    },
    select: (card) => {
      if (!card || card.moments.length === 0) return card;
      const acknowledged = new Set(readAckedMoments(scope));
      if (acknowledged.size === 0) return card;
      const moments = card.moments.filter((moment) => !acknowledged.has(moment.key));
      return moments.length === card.moments.length ? card : { ...card, moments };
    },
  });
}

/**
 * Other managers' cards for a page of a league, one batch read. 5 min stale. An empty list issues
 * no query. Each team id appears in the result at most once, in the order the server sent.
 */
export function useManagerCards(
  teamIds: readonly string[],
): UseQueryResult<MemberCardDto[], ManagerCardError> {
  const queryClient = useQueryClient();
  const live = useManagerCardLive();
  const { status } = useAuth();
  const ids = [...new Set(teamIds)];
  return useQuery<MemberCardDto[], ManagerCardError>({
    queryKey: managerCardKeys.cards(ids),
    enabled: live && status === "authenticated" && ids.length > 0,
    staleTime: 5 * 60_000,
    retry: retryCardRead,
    queryFn: async ({ signal }) => {
      let answer;
      try {
        answer = await managerCardService.cards(ids, signal);
      } catch (error) {
        throw mapManagerCardError(error);
      }
      if (!answer.available) {
        markManagerCardOff(queryClient);
        throw new ManagerCardError("unavailable", "The Manager Card is switched off.");
      }
      return answer.cards;
    },
  });
}

/**
 * The stored journées of one season (`null`: the current one), newest first, 20 a page, paged by
 * keyset on the journée number (`nextBeforeSeq`).
 */
export function useMyManagerCardHistory(
  seasonId: string | null,
): UseInfiniteQueryResult<InfiniteData<HistoryPage, number | null>, ManagerCardError> {
  const queryClient = useQueryClient();
  const { enabled, userId } = useCardAccess();
  return useInfiniteQuery<
    HistoryPage,
    ManagerCardError,
    InfiniteData<HistoryPage, number | null>,
    ReturnType<typeof managerCardKeys.history>,
    number | null
  >({
    queryKey: managerCardKeys.history(ackScope(userId), seasonId),
    enabled,
    staleTime: 60_000,
    retry: retryCardRead,
    initialPageParam: null,
    queryFn: async ({ pageParam, signal }) => {
      let answer;
      try {
        answer = await managerCardService.myHistory(
          { seasonId, beforeSeq: pageParam, limit: HISTORY_PAGE_SIZE },
          signal,
        );
      } catch (error) {
        throw mapManagerCardError(error);
      }
      if (!answer.available) {
        markManagerCardOff(queryClient);
        throw new ManagerCardError("unavailable", "The Manager Card is switched off.");
      }
      return answer;
    },
    getNextPageParam: (last) => last.nextBeforeSeq ?? undefined,
  });
}

/**
 * Acknowledge moments. Optimistic: the keys are written to this phone first (so a reload cannot
 * show them again) and removed from the cached card, then the call goes out. Never throws; a
 * failed call is retried by the next card read. One call for however many keys a hero folds in.
 */
export function useAckMoments(): (keys: readonly string[]) => Promise<void> {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const scope = ackScope(user?.id ?? null);
  return useCallback(
    async (keys) => {
      const unique = [...new Set(keys)];
      if (unique.length === 0) return;
      rememberAckedMoments(unique, scope);
      queryClient.setQueryData<MyCardDto | null>(managerCardKeys.me(scope), (card) =>
        card ? { ...card, moments: card.moments.filter((m) => !unique.includes(m.key)) } : card,
      );
      try {
        await managerCardService.ackMoments(unique);
      } catch {
        // Retried on the next visit; an acknowledgement never breaks a page.
      }
    },
    [queryClient, scope],
  );
}

/** After a first save or an import: refresh the card (never awaited, never on the critical path). */
export function invalidateMyManagerCard(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ["manager-card", "me"] });
  void queryClient.invalidateQueries({ queryKey: ["manager-card", "history"] });
}
