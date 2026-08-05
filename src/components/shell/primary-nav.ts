import { CalendarDays, Home, Newspaper, Trophy, User } from "lucide-react";
import type { ComponentType } from "react";

import type { TranslationKey } from "@/i18n/dictionaries";

export type PrimaryRoute = "/" | "/news" | "/fantasy" | "/matches" | "/profile";

export type PrimaryNavItem = {
  to: PrimaryRoute;
  labelKey: TranslationKey;
  icon: ComponentType<{ className?: string }>;
};

export const primaryNavItems: PrimaryNavItem[] = [
  { to: "/", labelKey: "nav.home", icon: Home },
  { to: "/news", labelKey: "nav.news", icon: Newspaper },
  { to: "/fantasy", labelKey: "nav.fantasy", icon: Trophy },
  { to: "/matches", labelKey: "nav.matches", icon: CalendarDays },
  { to: "/profile", labelKey: "nav.profile", icon: User },
];

export function isPrimaryRouteActive(pathname: string, route: PrimaryRoute): boolean {
  return route === "/" ? pathname === "/" : pathname.startsWith(route);
}
