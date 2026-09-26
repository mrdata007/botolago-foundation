import { CalendarDays, Gem, Home, Newspaper, Trophy, User } from "lucide-react";
import type { ComponentType } from "react";

import type { TranslationKey } from "@/i18n/dictionaries";
import { NEWS_ENABLED, PEPITES_PROMOTED } from "@/lib/feature-flags";

/**
 * `/news` stays in this union even while News is hidden: the route still
 * exists in the tree (it redirects), `isPrimaryRouteActive` is still called
 * with it from the all-items list below, and keeping it here means flipping
 * `NEWS_ENABLED` back on needs no type surgery.
 */
export type PrimaryRoute = "/" | "/news" | "/fantasy" | "/matches" | "/pepites" | "/profile";

export type PrimaryNavItem = {
  to: PrimaryRoute;
  labelKey: TranslationKey;
  icon: ComponentType<{ className?: string }>;
};

/** Every primary destination, ignoring feature flags. Not for rendering. */
const allPrimaryNavItems: PrimaryNavItem[] = [
  { to: "/", labelKey: "nav.home", icon: Home },
  { to: "/news", labelKey: "nav.news", icon: Newspaper },
  { to: "/fantasy", labelKey: "nav.fantasy", icon: Trophy },
  { to: "/matches", labelKey: "nav.matches", icon: CalendarDays },
  { to: "/pepites", labelKey: "nav.pepites", icon: Gem },
  { to: "/profile", labelKey: "nav.profile", icon: User },
];

/**
 * Pépites, once promoted, takes Profil's slot (the bar has no room for a
 * sixth), and Profile moves to an icon in the top bar (`TopBar`,
 * `PEPITES_PROMOTED`). Until then Pépites has no slot.
 */
export function withPepitesSlot(
  items: readonly PrimaryNavItem[],
  promoted: boolean,
): PrimaryNavItem[] {
  return items.filter((item) =>
    item.to === "/pepites" ? promoted : item.to === "/profile" ? !promoted : true,
  );
}

/**
 * The navigable primary destinations. News is filtered out while
 * `NEWS_ENABLED` is false (owner decision — see `@/lib/feature-flags`), which
 * removes it from the bottom nav, the top bar and the Fantasy mobile nav in
 * one place instead of three.
 */
export const primaryNavItems: PrimaryNavItem[] = withPepitesSlot(
  allPrimaryNavItems.filter((item) => NEWS_ENABLED || item.to !== "/news"),
  PEPITES_PROMOTED,
);

export function isPrimaryRouteActive(pathname: string, route: PrimaryRoute): boolean {
  if (route === "/") return pathname === "/";
  // Pronostics lives in the Matches section (BG-0146): the bar has no sixth slot.
  if (route === "/matches" && pathname.startsWith("/pronostics")) return true;
  return pathname.startsWith(route);
}
