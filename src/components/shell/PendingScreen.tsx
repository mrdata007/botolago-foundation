// What the reader sees while the next page is not ready yet
// (docs/engineering/SECTION_LOADING.md).
//
// Without it the router keeps the old page on screen, unchanged, until the new
// one's code and data are in: on a first visit to Fantasy that was close to
// three seconds of a page that looked frozen. The router shows this instead
// once a navigation has waited `PENDING_MS`: the app's own frame (the top
// bar, the section's title, the bottom bar with its pill already on the new
// tab) around the usual loading placeholders, so the tap visibly took.
//
// The admin and auth screens have frames of their own, so they get the
// placeholders alone; the detail pages that hide the bottom bar hide it here
// too, so the bar does not appear for a moment and then go.

import { useRouterState } from "@tanstack/react-router";

import { UiPageTitle, UiStatePanel } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { useManagerCardLive } from "@/services/manager-card-status";
import { AppShell } from "./AppShell";
import { pendingHidesBottomNav, pendingWithoutShell } from "./pending-screen-rules";
import { isPrimaryRouteActive, usePrimaryNavItems } from "./primary-nav";

/** How long a navigation waits before this shows, and the least time it stays once shown. */
export const PENDING_MS = 150;
export const PENDING_MIN_MS = 200;

export function PendingScreen() {
  const { t } = useI18n();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const items = usePrimaryNavItems();
  const curvaLive = useManagerCardLive();

  const loading = <UiStatePanel kind="loading" testId="pending-screen" />;
  if (pendingWithoutShell(pathname)) return <div className="px-4">{loading}</div>;

  const hideBottomNav = pendingHidesBottomNav(pathname);
  // A section's own title, as its page draws it, so the screen already says where the tap went.
  // Home has none (its hero is the title), and neither has a detail page.
  const section = hideBottomNav
    ? undefined
    : items.find((item) => item.to !== "/" && isPrimaryRouteActive(pathname, item.to, curvaLive));

  return (
    <AppShell
      hideBottomNav={hideBottomNav}
      pageHeader={section ? <UiPageTitle title={t(section.labelKey)} /> : undefined}
    >
      {loading}
    </AppShell>
  );
}
