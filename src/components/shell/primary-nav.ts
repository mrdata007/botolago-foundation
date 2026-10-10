import { CalendarDays, Gem, Home, Newspaper, Trophy, User, UsersRound } from "lucide-react";
import type { ComponentType } from "react";

import type { TranslationKey } from "@/i18n/dictionaries";
import { MANAGER_CARD_BUILD, NEWS_ENABLED, PEPITES_PROMOTED } from "@/lib/feature-flags";
import { useManagerCardLive } from "@/services/manager-card-status";

/**
 * `/news` stays in this union even while News is hidden: the route still
 * exists in the tree (it redirects), `isPrimaryRouteActive` is still called
 * with it from the all-items list below, and keeping it here means flipping
 * `NEWS_ENABLED` back on needs no type surgery.
 */
export type PrimaryRoute =
  | "/"
  | "/news"
  | "/fantasy"
  | "/matches"
  | "/pepites"
  | "/curva"
  | "/profile";

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
  // Curva (the Manager Card section) takes the fifth slot only while it is live; see
  // `withFifthSlot` and `usePrimaryNavItems`. `withPepitesSlot` never lets it into `primaryNavItems`.
  { to: "/curva", labelKey: "nav.curva", icon: UsersRound },
  { to: "/profile", labelKey: "nav.profile", icon: User },
];

/**
 * Pépites, once promoted, takes Profil's slot in the bar (the bar has no room for a
 * sixth), and Profile moves to an icon in the top bar (`TopBar`, `PEPITES_PROMOTED`). Until then
 * Pépites has no slot. Curva is never in this list: it exists only while it is live
 * (`withFifthSlot`).
 */
export function withPepitesSlot(
  items: readonly PrimaryNavItem[],
  promoted: boolean,
): PrimaryNavItem[] {
  return items.filter((item) =>
    item.to === "/curva"
      ? false
      : item.to === "/pepites"
        ? promoted
        : item.to === "/profile"
          ? !promoted
          : true,
  );
}

/**
 * The fifth slot: Curva when it is live, else Pépites when promoted, else Profil. While Curva
 * is live Pépites has no slot (it lives inside Fantasy then) and Profil stays in the top bar.
 */
export function withFifthSlot(
  items: readonly PrimaryNavItem[],
  slot: { pepitesPromoted: boolean; curvaLive: boolean },
): PrimaryNavItem[] {
  return items.filter((item) =>
    item.to === "/curva"
      ? slot.curvaLive
      : item.to === "/pepites"
        ? slot.pepitesPromoted && !slot.curvaLive
        : item.to === "/profile"
          ? !slot.pepitesPromoted && !slot.curvaLive
          : true,
  );
}

/** Every destination the build offers: News follows its switch, ignoring the fifth slot. */
const offeredNavItems = allPrimaryNavItems.filter((item) => NEWS_ENABLED || item.to !== "/news");

/**
 * The navigable primary destinations. News is filtered out while
 * `NEWS_ENABLED` is false (owner decision — see `@/lib/feature-flags`), which
 * removes it from the bottom nav and the top bar in one place instead of two.
 * (A third consumer, the Fantasy mobile nav, was deleted with BG-0145.)
 *
 * Exactly today's list: Curva is never in it, so every existing reader and test of this
 * constant is unchanged.
 */
export const primaryNavItems: PrimaryNavItem[] = withPepitesSlot(offeredNavItems, PEPITES_PROMOTED);

/** The list while Curva is live: Accueil, Actualités, Fantasy, Matches, Curva. */
export const liveNavItems: PrimaryNavItem[] = withFifthSlot(offeredNavItems, {
  pepitesPromoted: PEPITES_PROMOTED,
  curvaLive: true,
});

function useLiveAwareNavItems(): PrimaryNavItem[] {
  return useManagerCardLive() ? liveNavItems : primaryNavItems;
}
function useTodaysNavItems(): PrimaryNavItem[] {
  return primaryNavItems;
}

/**
 * The bar's items: `primaryNavItems` (the same array object) unless Curva is live. With the
 * build switch off this is a plain function returning that constant: no hook, no query.
 */
export const usePrimaryNavItems: () => PrimaryNavItem[] = MANAGER_CARD_BUILD
  ? useLiveAwareNavItems
  : useTodaysNavItems;

/**
 * Whether `route`'s item is the active one at `pathname`. `curvaLive` lights Fantasy on
 * /pepites pages (Pépites lives inside Fantasy then) and never lights a slot that is not in the
 * bar: Pépites while Curva is live, Curva while it is not. The default, false, keeps every
 * existing call and test as it is.
 */
export function isPrimaryRouteActive(
  pathname: string,
  route: PrimaryRoute,
  curvaLive = false,
): boolean {
  if (route === "/") return pathname === "/";
  // Pronostics lives in the Matches section (BG-0146): the bar has no sixth slot.
  if (route === "/matches" && pathname.startsWith("/pronostics")) return true;
  if (curvaLive) {
    if (route === "/fantasy" && pathname.startsWith("/pepites")) return true;
    if (route === "/pepites") return false;
  } else if (route === "/curva") {
    return false;
  }
  return pathname.startsWith(route);
}
