import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { useAuth } from "@/auth/AuthProvider";
import { useI18n } from "@/i18n/provider";
import { NEWS_ENABLED } from "@/lib/feature-flags";
import { nativePlatform } from "@/lib/native-app";
import { pushDestination } from "@/lib/push-payload";
import { ensureAndroidChannels, refreshRegistration } from "@/services/native-push";
import { loadNativePushDeps } from "@/services/native-push-runtime";
import { MY_NOTIFICATIONS_QUERY_KEY } from "@/services/use-my-notifications";
import { useMyNotificationPreferences } from "@/services/use-notification-preferences";

/** At most one re-registration this often when the app comes back to the front. */
const REFRESH_EVERY_MS = 30 * 60 * 1000;

/**
 * The phone app's push plumbing, mounted once in the root. Renders nothing, and
 * does nothing at all in a browser or on the server.
 *
 *  - Tapping an alert opens the page it is about (the match, the transfers
 *    page). The listener is added as early as the app can, so a tap that
 *    launched the app is still delivered.
 *  - An alert that arrives while the app is open refreshes the inbox and the
 *    unread count (the phone shows the alert itself).
 *  - While the signed-in account has push on, this phone's registration is
 *    renewed when the app starts and when it comes back to the front, never more
 *    often than every 30 minutes. It never asks for permission: that happens
 *    only when the reader turns the switch on.
 */
export function NativePushBridge() {
  // Decided after the first render, so the server and the first client render
  // agree. Everything below runs (and every query it makes is made) only in the app.
  const [native, setNative] = useState(false);
  useEffect(() => {
    setNative(nativePlatform() !== null);
  }, []);
  return native ? <NativePushBridgeActive /> : null;
}

function NativePushBridgeActive() {
  const { status } = useAuth();
  const { lang, t } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { preferences } = useMyNotificationPreferences();
  const langRef = useRef(lang);
  const lastRefresh = useRef(0);
  const pushOn = status === "authenticated" && preferences?.channels.push === true;

  useEffect(() => {
    langRef.current = lang;
  }, [lang]);

  // Android: the two channels the sender names, in the reader's language.
  useEffect(() => {
    if (nativePlatform() !== "android") return;
    void import("@capacitor/push-notifications")
      .then(({ PushNotifications }) =>
        ensureAndroidChannels(PushNotifications, {
          match: t("auth.setup.notif_match"),
          fantasy: t("auth.setup.notif_deadline"),
        }),
      )
      .catch(() => undefined);
  }, [t]);

  // Alerts: tapped, and received while the app is open.
  useEffect(() => {
    let cancelled = false;
    const handles: Array<{ remove(): Promise<void> }> = [];
    void (async () => {
      const { PushNotifications } = await import("@capacitor/push-notifications");
      const opened = await PushNotifications.addListener(
        "pushNotificationActionPerformed",
        (action) => {
          const destination = pushDestination(action.notification.data, NEWS_ENABLED);
          if (destination) void navigate(destination as Parameters<typeof navigate>[0]);
        },
      );
      const received = await PushNotifications.addListener("pushNotificationReceived", () => {
        void queryClient.invalidateQueries({ queryKey: MY_NOTIFICATIONS_QUERY_KEY });
      });
      if (cancelled) {
        await Promise.allSettled([opened.remove(), received.remove()]);
        return;
      }
      handles.push(opened, received);
    })().catch(() => undefined);
    return () => {
      cancelled = true;
      void Promise.allSettled(handles.map((handle) => handle.remove()));
    };
  }, [navigate, queryClient]);

  // Registration: renewed while the account has push on.
  useEffect(() => {
    if (!pushOn) return;
    let cancelled = false;
    const handles: Array<{ remove(): Promise<void> }> = [];
    const refresh = async () => {
      if (Date.now() - lastRefresh.current < REFRESH_EVERY_MS) return;
      lastRefresh.current = Date.now();
      try {
        const deps = await loadNativePushDeps(langRef.current);
        if (deps && !cancelled) await refreshRegistration(deps);
      } catch {
        // Tried again the next time the app comes to the front.
      }
    };
    void refresh();
    void (async () => {
      const { App } = await import("@capacitor/app");
      const handle = await App.addListener("appStateChange", ({ isActive }) => {
        if (isActive) void refresh();
      });
      if (cancelled) await handle.remove();
      else handles.push(handle);
    })().catch(() => undefined);
    return () => {
      cancelled = true;
      void Promise.allSettled(handles.map((handle) => handle.remove()));
    };
  }, [pushOn]);

  return null;
}
