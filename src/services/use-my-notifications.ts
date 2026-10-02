import { useCallback } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/auth/AuthProvider";
import type { NotificationCategory } from "@/backend/notifications/contracts";
import { encodeNotificationCursor } from "@/backend/notifications/supabase-repositories";
import {
  dismissMyNotification,
  loadMyNotifications,
  loadMyUnreadNotificationCount,
  markAllMyNotificationsRead,
  markMyNotificationRead,
} from "@/services/notifications";

/** Every cached inbox read of anyone, for invalidation. */
export const MY_NOTIFICATIONS_QUERY_KEY = ["notifications", "inbox"] as const;

/** How often the bell's unread count is asked again while the page is visible. */
const UNREAD_REFRESH_MS = 60_000;

function useSignedInUserId(): string | null {
  const { user, status } = useAuth();
  return status === "authenticated" && user ? user.id : null;
}

/** The bell's count: asked only for a signed-in account, keyed by that account. */
export function useUnreadNotificationCount(): number {
  const userId = useSignedInUserId();
  const query = useQuery({
    queryKey: [...MY_NOTIFICATIONS_QUERY_KEY, "unread", userId],
    queryFn: loadMyUnreadNotificationCount,
    enabled: userId !== null,
    staleTime: 30_000,
    refetchInterval: UNREAD_REFRESH_MS,
    refetchIntervalInBackground: false,
  });
  return query.data ?? 0;
}

/** The inbox, newest first, a page at a time. */
export function useMyNotifications(category: NotificationCategory | null) {
  const userId = useSignedInUserId();
  return useInfiniteQuery({
    queryKey: [...MY_NOTIFICATIONS_QUERY_KEY, "list", userId, category],
    queryFn: ({ pageParam }) => loadMyNotifications(category, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => encodeNotificationCursor(last.nextCursor),
    enabled: userId !== null,
  });
}

/** Read, mark-all-read and dismiss; each refreshes the inbox and the bell. */
export function useNotificationActions() {
  const queryClient = useQueryClient();
  const refresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey: MY_NOTIFICATIONS_QUERY_KEY }),
    [queryClient],
  );
  const read = useMutation({
    mutationFn: (id: string) => markMyNotificationRead(id, true),
    onSuccess: refresh,
  });
  const readAll = useMutation({ mutationFn: markAllMyNotificationsRead, onSuccess: refresh });
  const dismiss = useMutation({ mutationFn: dismissMyNotification, onSuccess: refresh });
  return { read, readAll, dismiss };
}
