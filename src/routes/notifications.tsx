import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  Bell,
  CircleDot,
  Info,
  LogIn,
  Newspaper,
  ShieldCheck,
  Trophy,
  UserPlus,
  X,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState } from "react";

import { useAuth } from "@/auth/AuthProvider";
import { authOutlineClass } from "@/components/auth/auth-classes";
import { EmptyState, ErrorState } from "@/components/common/States";
import { AppShell } from "@/components/shell/AppShell";
import {
  ui,
  UiButton,
  UiCard,
  UiChip,
  UiLinkButton,
  UiPageTitle,
  UiSkeleton,
} from "@/components/ui-kit";
import type { NotificationCardDto, NotificationCategory } from "@/backend/notifications/contracts";
import { useI18n } from "@/i18n/provider";
import { NEWS_ENABLED } from "@/lib/feature-flags";
import { formatRelativeTime } from "@/lib/format-time";
import { notificationDestination } from "@/lib/notification-link";
import { staggerStyle, useArrivals } from "@/lib/motion";
import { cn } from "@/lib/utils";
import {
  useMyNotifications,
  useNotificationActions,
  useUnreadNotificationCount,
} from "@/services/use-my-notifications";

export const Route = createFileRoute("/notifications")({
  head: () => ({
    meta: [{ title: "Notifications — BotolaGO" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: NotificationsPage,
});

const CATEGORY_ICON: Record<NotificationCategory, LucideIcon> = {
  football: CircleDot,
  fantasy: Trophy,
  news: Newspaper,
  account: ShieldCheck,
  security: ShieldCheck,
  system: Info,
};

function NotificationsPage() {
  const { t } = useI18n();
  const { status } = useAuth();
  const signedIn = status === "authenticated";

  return (
    <AppShell pageHeader={<UiPageTitle title={t("notifications.title")} />}>
      {signedIn ? <Inbox /> : status === "loading" ? null : <SignInPrompt />}
    </AppShell>
  );
}

function SignInPrompt() {
  const { t } = useI18n();
  return (
    <UiCard padding="lg" className="text-center">
      <Bell className={cn("mx-auto h-8 w-8", ui.tone.ink)} aria-hidden />
      <h2 className={cn("mt-3", ui.display.section, ui.tone.default)}>
        {t("notifications.signin_title")}
      </h2>
      <p className={cn("mt-1", ui.text.secondary, ui.tone.muted)}>
        {t("notifications.signin_body")}
      </p>
      <div className="mt-5 grid gap-2.5">
        <UiLinkButton to="/auth/register">
          <UserPlus className="h-4 w-4" aria-hidden /> {t("auth.prompt.register")}
        </UiLinkButton>
        <UiLinkButton to="/auth/login" variant="outline" className={authOutlineClass}>
          <LogIn className="h-4 w-4" aria-hidden /> {t("auth.prompt.login")}
        </UiLinkButton>
      </div>
    </UiCard>
  );
}

function Inbox() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const [category, setCategory] = useState<NotificationCategory | null>(null);
  const inboxQ = useMyNotifications(category);
  const { read, readAll, dismiss } = useNotificationActions();
  const unread = useUnreadNotificationCount();
  // A dismissed card leaves at once, before the refreshed list arrives.
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());

  const cards = useMemo(
    () => (inboxQ.data?.pages ?? []).flatMap((page) => page.items).filter((c) => !hidden.has(c.id)),
    [inboxQ.data, hidden],
  );

  // Cards that arrive at the top while the page is open fade in one by one.
  const arrived = useArrivals(cards.map((card) => card.id));

  const open = (card: NotificationCardDto) => {
    if (!card.readAt) read.mutate(card.id);
    const destination = notificationDestination(card.deepLink, NEWS_ENABLED);
    if (destination) void navigate(destination as Parameters<typeof navigate>[0]);
  };
  const remove = (card: NotificationCardDto) => {
    setHidden((current) => new Set(current).add(card.id));
    dismiss.mutate(card.id);
  };

  return (
    <div className="grid gap-4">
      <div role="group" aria-label={t("notifications.title")} className="flex flex-wrap gap-1.5">
        <UiChip selected={category === null} onClick={() => setCategory(null)}>
          {t("notifications.filter.all")}
        </UiChip>
        <UiChip selected={category === "football"} onClick={() => setCategory("football")}>
          {t("notifications.filter.football")}
        </UiChip>
        <UiChip selected={category === "fantasy"} onClick={() => setCategory("fantasy")}>
          {t("notifications.filter.fantasy")}
        </UiChip>
        {NEWS_ENABLED ? (
          <UiChip selected={category === "news"} onClick={() => setCategory("news")}>
            {t("notifications.filter.news")}
          </UiChip>
        ) : null}
      </div>

      {unread > 0 ? (
        <UiButton
          variant="ghost"
          size="sm"
          className="justify-self-end"
          disabled={readAll.isPending}
          onClick={() => readAll.mutate()}
        >
          {t("notifications.mark_all_read")}
        </UiButton>
      ) : null}

      {inboxQ.isError ? (
        <ErrorState onRetry={() => void inboxQ.refetch()} />
      ) : inboxQ.isPending ? (
        <UiCard padding="lg">
          <UiSkeleton className="h-4 w-1/2" />
          <UiSkeleton className="mt-3 h-3 w-5/6" />
        </UiCard>
      ) : cards.length === 0 ? (
        <EmptyState>
          <p className={cn(ui.display.section, ui.tone.default)}>
            {t("notifications.empty_title")}
          </p>
          <p>{t("notifications.empty_body")}</p>
        </EmptyState>
      ) : (
        <>
          <UiCard padding="none" className="overflow-hidden">
            <ul className="divide-y divide-[color:var(--ui-rule)]">
              {cards.map((card, index) => {
                const Icon = CATEGORY_ICON[card.category];
                const isUnread = !card.readAt;
                return (
                  <li
                    key={card.id}
                    className={cn(
                      "flex items-stretch",
                      arrived.has(card.id) && "enter-rise stagger",
                    )}
                    style={arrived.has(card.id) ? staggerStyle(index) : undefined}
                  >
                    <button
                      type="button"
                      onClick={() => open(card)}
                      className={cn(
                        "flex min-w-0 flex-1 items-start gap-3 py-3 ps-4 pe-2 text-start",
                        "hover:bg-[color:var(--ui-surface-sunken)] active:bg-[color:var(--ui-surface-sunken)]",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--ui-ink-fg)]",
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "mt-0.5 grid h-9 w-9 shrink-0 place-items-center",
                          ui.radius.full,
                          ui.surface.sunken,
                          ui.tone.ink,
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1" dir={card.direction}>
                        <span
                          className={cn(
                            "block",
                            ui.text.body,
                            isUnread
                              ? "[font-weight:var(--ui-weight-heavy)]"
                              : "[font-weight:var(--ui-weight-medium,500)]",
                          )}
                        >
                          {isUnread ? (
                            <span className="sr-only">{t("notifications.unread")}. </span>
                          ) : null}
                          {card.title}
                        </span>
                        <span
                          className={cn(
                            "mt-0.5 line-clamp-3 block",
                            ui.text.secondary,
                            ui.tone.muted,
                          )}
                        >
                          {card.body}
                        </span>
                        <span className={cn("mt-1 block", ui.text.meta, ui.tone.muted)}>
                          {formatRelativeTime(card.createdAt, lang)}
                        </span>
                      </span>
                      {isUnread ? (
                        <span
                          aria-hidden
                          className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-[color:var(--ui-ink-fg)]"
                        />
                      ) : null}
                    </button>
                    <button
                      type="button"
                      aria-label={t("notifications.dismiss")}
                      onClick={() => remove(card)}
                      className={cn(
                        "grid w-11 shrink-0 place-items-center",
                        ui.tone.muted,
                        "hover:bg-[color:var(--ui-surface-sunken)] active:bg-[color:var(--ui-surface-sunken)]",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--ui-ink-fg)]",
                      )}
                    >
                      <X className="h-4 w-4" aria-hidden />
                    </button>
                  </li>
                );
              })}
            </ul>
          </UiCard>
          {inboxQ.hasNextPage ? (
            <UiButton
              variant="soft"
              disabled={inboxQ.isFetchingNextPage}
              onClick={() => void inboxQ.fetchNextPage()}
            >
              {t("notifications.load_more")}
            </UiButton>
          ) : null}
        </>
      )}
    </div>
  );
}
