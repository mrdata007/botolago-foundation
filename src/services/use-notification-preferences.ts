import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/auth/AuthProvider";
import type { NotificationPreferencesDto } from "@/backend/notifications/contracts";
import {
  loadMyNotificationPreferences,
  setMyEmailNotifications,
  setMyPushNotifications,
} from "@/services/notifications";

/** Every cached copy of anyone's preferences, for invalidation. */
export const NOTIFICATION_PREFERENCES_QUERY_KEY = ["notifications", "preferences"] as const;

export function notificationPreferencesQueryKey(userId: string | null) {
  return [...NOTIFICATION_PREFERENCES_QUERY_KEY, userId] as const;
}

/**
 * The signed-in account's notification preferences, read only while someone is
 * signed in, and one cache entry for every screen that shows the e-mail switch
 * (the Fantasy hub and the profile wizard's notifications step).
 *
 * `setEmailEnabled` and `setPushEnabled` are optimistic: the cached value
 * moves at once, is replaced by what the server stored, and moves back if the
 * save fails — in which case they rethrow so the caller can say so.
 */
export function useMyNotificationPreferences(): {
  preferences: NotificationPreferencesDto | undefined;
  setEmailEnabled: (enabled: boolean) => Promise<NotificationPreferencesDto>;
  setPushEnabled: (enabled: boolean) => Promise<NotificationPreferencesDto>;
} {
  const { user, status } = useAuth();
  const userId = status === "authenticated" && user ? user.id : null;
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: notificationPreferencesQueryKey(userId),
    queryFn: loadMyNotificationPreferences,
    enabled: userId !== null,
  });

  const setChannelEnabled = useCallback(
    async (
      channel: "email" | "push",
      save: (enabled: boolean) => Promise<NotificationPreferencesDto>,
      enabled: boolean,
    ) => {
      const key = notificationPreferencesQueryKey(userId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<NotificationPreferencesDto>(key);
      if (previous)
        queryClient.setQueryData<NotificationPreferencesDto>(key, {
          ...previous,
          channels: { ...previous.channels, [channel]: enabled },
        });
      try {
        const saved = await save(enabled);
        queryClient.setQueryData(key, saved);
        return saved;
      } catch (error) {
        if (previous) queryClient.setQueryData(key, previous);
        throw error;
      }
    },
    [queryClient, userId],
  );
  const setEmailEnabled = useCallback(
    (enabled: boolean) =>
      setChannelEnabled("email", (value) => setMyEmailNotifications(value), enabled),
    [setChannelEnabled],
  );
  const setPushEnabled = useCallback(
    (enabled: boolean) =>
      setChannelEnabled("push", (value) => setMyPushNotifications(value), enabled),
    [setChannelEnabled],
  );

  return { preferences: query.data, setEmailEnabled, setPushEnabled };
}
