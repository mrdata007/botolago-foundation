import { CalendarDays, Home, Newspaper, Trophy, User } from "lucide-react";
import type { ComponentType } from "react";

import type { TranslationKey } from "@/i18n/dictionaries";
import { NEWS_ENABLED } from "@/lib/feature-flags";

/**
 * `/news` stays in this union even while News is hidden: the route still
 * exists in the tree (it redirects), `isPrimaryRouteActive` is still called
 * with it from the all-items list below, and keeping it here means flipping
 * `NEWS_ENABLED` back on needs no type surgery.
 */
export type PrimaryRoute = "/" | "/news" | "/fantasy" | "/matches" | "/profile";

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
  { to: "/profile", labelKey: "nav.profile", icon: User },
];

/**
 * The navigable primary destinations. News is filtered out while
 * `NEWS_ENABLED` is false (owner decision — see `@/lib/feature-flags`), which
 * removes it from the bottom nav, the top bar and the Fantasy mobile nav in
 * one place instead of three.
 */
export const primaryNavItems: PrimaryNavItem[] = allPrimaryNavItems.filter(
  (item) => NEWS_ENABLED || item.to !== "/news",
);

export function isPrimaryRouteActive(pathname: string, route: PrimaryRoute): boolean {
  return route === "/" ? pathname === "/" : pathname.startsWith(route);
}
