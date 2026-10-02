// The bell in the top bar: opens the inbox, with the unread count on it.
// Drawn only for a signed-in account, the only one that has an inbox.

import { Bell } from "lucide-react";

import { useOptionalAuth } from "@/auth/AuthProvider";
import { UiIconLinkButton } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { useUnreadNotificationCount } from "@/services/use-my-notifications";

/** The badge says "9+" past nine: the exact number is for the inbox. */
export function bellBadgeText(count: number): string {
  return count > 9 ? "9+" : String(count);
}

export function NotificationBell() {
  const auth = useOptionalAuth();
  return auth?.status === "authenticated" ? <SignedInBell /> : null;
}

function SignedInBell() {
  const { t } = useI18n();
  const unread = useUnreadNotificationCount();
  return (
    <span className="relative inline-flex">
      <UiIconLinkButton
        to="/notifications"
        aria-label={
          unread > 0 ? `${t("notifications.title")} (${unread})` : t("notifications.title")
        }
      >
        <Bell aria-hidden />
      </UiIconLinkButton>
      {unread > 0 ? (
        <span
          aria-hidden
          className="pointer-events-none absolute -end-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-[color:var(--ui-ink)] px-1 text-[0.6875rem] leading-none text-[color:var(--ui-on-ink)] [font-weight:var(--ui-weight-heavy)]"
        >
          {bellBadgeText(unread)}
        </span>
      ) : null}
    </span>
  );
}
