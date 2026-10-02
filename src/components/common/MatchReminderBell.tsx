// "Remind me" on a match row: a round bell button, on or off.
//
// Signed out, a tap asks for an account first. Signed in, it saves the
// reminder on the server (a match subscription) and says honestly what will
// happen: the reminder reaches the inbox and e-mail about an hour before
// kick-off, and only for an account that has e-mail notifications on, so when
// they are off the toast offers to turn them on.

import { Bell, BellRing } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { useOptionalAuth } from "@/auth/AuthProvider";
import { UiIconButton } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { rememberReminder, replaceReminders, useHasReminder } from "@/lib/match-reminders";
import {
  loadMyMatchReminders,
  loadMyNotificationPreferences,
  setMyEmailNotifications,
  setMyMatchReminder,
} from "@/services/notifications";

// One read of the account's reminders per account and page load, shared by
// every bell on the page. A server without the read function (not yet
// updated) answers with an error; the bell then keeps what this device set.
const syncing = new Map<string, Promise<void>>();
function syncRemindersOnce(userId: string): void {
  if (syncing.has(userId)) return;
  syncing.set(
    userId,
    loadMyMatchReminders()
      .then((ids) => replaceReminders(userId, ids))
      .catch(() => undefined),
  );
}

export function MatchReminderBell({ fixtureId }: { fixtureId: string }) {
  const { t } = useI18n();
  const auth = useOptionalAuth();
  const userId = auth?.status === "authenticated" && auth.user ? auth.user.id : null;
  const on = useHasReminder(userId, fixtureId);
  useEffect(() => {
    if (userId) syncRemindersOnce(userId);
  }, [userId]);
  const [pending, setPending] = useState(false);

  const toggle = async (account: string) => {
    const enable = !on;
    setPending(true);
    try {
      await setMyMatchReminder(fixtureId, enable);
      rememberReminder(account, fixtureId, enable);
      if (!enable) {
        toast(t("reminders.toast.off"));
        return;
      }
      const preferences = await loadMyNotificationPreferences().catch(() => null);
      if (preferences && !preferences.channels.email) {
        toast(t("reminders.toast.needs_email"), {
          action: {
            label: t("reminders.toast.enable_email"),
            onClick: () => {
              void setMyEmailNotifications(true)
                .then(() => toast.success(t("reminders.toast.email_on")))
                .catch(() => toast.error(t("state.error")));
            },
          },
        });
      } else {
        toast.success(t("reminders.toast.on"));
      }
    } catch {
      toast.error(t("state.error"));
    } finally {
      setPending(false);
    }
  };

  const onClick = () => {
    if (userId) void toggle(userId);
    else
      auth?.requireAuth(
        () => {
          // The account arrives after the sign-in; the next tap saves it.
        },
        { reason: t("reminders.sign_in_reason") },
      );
  };

  return (
    <UiIconButton
      aria-label={on ? t("reminders.bell.on") : t("reminders.bell.off")}
      aria-pressed={on}
      disabled={pending}
      onClick={onClick}
    >
      {on ? <BellRing aria-hidden /> : <Bell aria-hidden />}
    </UiIconButton>
  );
}
