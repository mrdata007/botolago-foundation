import { CalendarDays, Gem, Home, Newspaper, Trophy, User, UsersRound } from "lucide-react";
import type { ComponentType } from "react";

import { useOptionalAuth } from "@/auth/AuthProvider";
import type { TranslationKey } from "@/i18n/dictionaries";
import { MANAGER_CARD_BUILD, NEWS_ENABLED, PEPITES_PROMOTED } from "@/lib/feature-flags";
import type { AuthStatus } from "@/services/auth-types";
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
  // Matches second (owner decision, 2026-10-26): the bar leads with what is on today.
  { to: "/matches", labelKey: "nav.matches", icon: CalendarDays },
  { to: "/fantasy", labelKey: "nav.fantasy", icon: Trophy },
  { to: "/news", labelKey: "nav.news", icon: Newspaper },
  // Prospects ("Pépites"): the fifth tab of every reader who does not have Curva in the bar.
  { to: "/pepites", labelKey: "nav.pepites", icon: Gem },
  // Curva (the Manager Card section) takes the fifth slot only for a signed-in member, and only
  // while it is live; see `withFifthSlot`, `curvaInBar` and `usePrimaryNavItems`.
  // `withPepitesSlot` never lets it into `primaryNavItems`.
  { to: "/curva", labelKey: "nav.curva", icon: UsersRound },
  { to: "/profile", labelKey: "nav.profile", icon: User },
];

/**
 * Pépites, once promoted, takes Profil's slot in the bar (the bar has no room for a
 * sixth), and Profile moves to an icon in the top bar (`TopBar`, `PEPITES_PROMOTED`). Until then
 * Pépites has no slot. Curva is never in this list: it exists only for a member while it is live
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
 * The fifth slot: Curva when it is in this reader's bar (`curvaInBar`), else Prospects (Pépites)
 * when promoted, else Profil. While Curva holds the slot Prospects has none (it lives inside
 * Fantasy then) and Profil stays in the top bar. `curvaLive` here is that already-decided answer,
 * not the raw database status: a signed-out visitor never gets Curva from it.
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
 * The navigable primary destinations of every reader who does not have Curva in the bar: a
 * signed-out visitor (owner decision, 2026-10-28), a member while Curva is not live, and anyone
 * while the session is not known yet. The fifth tab is Prospects. News is filtered out while
 * `NEWS_ENABLED` is false (owner decision — see `@/lib/feature-flags`), which removes it from the
 * bottom nav and the top bar in one place instead of two.
 * (A third consumer, the Fantasy mobile nav, was deleted with BG-0145.)
 *
 * Curva is never in it, so every existing reader and test of this constant is unchanged.
 */
export const primaryNavItems: PrimaryNavItem[] = withPepitesSlot(offeredNavItems, PEPITES_PROMOTED);

/**
 * The list for a signed-in member while Curva is live: Accueil, Matchs, Fantasy, Actualités,
 * Curva. Everyone else gets `primaryNavItems`.
 */
export const liveNavItems: PrimaryNavItem[] = withFifthSlot(offeredNavItems, {
  pepitesPromoted: PEPITES_PROMOTED,
  curvaLive: true,
});

/**
 * Whether Curva is in the bar for a reader: it is live AND the reader is a signed-in member.
 * Owner decision, 2026-10-28: Curva is for members. A signed-out visitor (`guest`, `anonymous`), a
 * session that is not known yet (`loading`) and one that still owes its second factor all get the
 * visitor bar, so the bar never offers Curva to anyone the Curva gate would lock out. The gate
 * itself (`curvaAccess`, `src/routes/curva.tsx`) is a separate check and stays: a direct visit to
 * `/curva` is still locked.
 */
export function curvaInBar(curvaLive: boolean, status: AuthStatus): boolean {
  return curvaLive && status === "authenticated";
}

/** The bar's items for a reader: the live list when Curva is in their bar, else the visitor list. */
export function navItemsFor(inBar: boolean): PrimaryNavItem[] {
  return inBar ? liveNavItems : primaryNavItems;
}

/**
 * `useCurvaInBar` with the build switch on. The session comes from the provider the app mounts at
 * the root; outside one (a server-rendered fragment in a test) it reads as `loading`, which is the
 * visitor bar. That is also what the server render and the first client render draw (the session
 * is only known after hydration), so hydration agrees, and the five tabs are the same size either
 * way, so a member's fifth tab turning from Prospects into Curva moves nothing.
 */
function useMemberCurvaInBar(): boolean {
  const live = useManagerCardLive();
  const status = useOptionalAuth()?.status ?? "loading";
  return curvaInBar(live, status);
}
function useNoCurvaInBar(): boolean {
  return false;
}

/** Whether Curva is in this reader's bar. With the build switch off: constant false, no hook. */
export const useCurvaInBar: () => boolean = MANAGER_CARD_BUILD
  ? useMemberCurvaInBar
  : useNoCurvaInBar;

function useMemberAwareNavItems(): PrimaryNavItem[] {
  return navItemsFor(useMemberCurvaInBar());
}
function useTodaysNavItems(): PrimaryNavItem[] {
  return primaryNavItems;
}

/**
 * The bar's items: `primaryNavItems` (the same array object) unless the reader is a signed-in
 * member and Curva is live. With the build switch off this is a plain function returning that
 * constant: no hook, no query.
 */
export const usePrimaryNavItems: () => PrimaryNavItem[] = MANAGER_CARD_BUILD
  ? useMemberAwareNavItems
  : useTodaysNavItems;

/**
 * Whether `route`'s item is the active one at `pathname`. `inBar` (the third argument, `curvaInBar`) says
 * Curva holds the fifth slot for this reader: it lights Fantasy on /pepites pages (Prospects
 * lives inside Fantasy then) and never lights a slot that is not in the bar: Prospects while
 * Curva holds the slot, Curva while it does not. Without it (the default, false: a visitor, or
 * Curva off) every /pepites page lights Prospects, sub-routes included.
 */
export function isPrimaryRouteActive(
  pathname: string,
  route: PrimaryRoute,
  inBar = false,
): boolean {
  if (route === "/") return pathname === "/";
  // Pronostics lives in the Matches section (BG-0146): the bar has no sixth slot.
  if (route === "/matches" && pathname.startsWith("/pronostics")) return true;
  if (inBar) {
    if (route === "/fantasy" && pathname.startsWith("/pepites")) return true;
    if (route === "/pepites") return false;
  } else if (route === "/curva") {
    return false;
  }
  return pathname.startsWith(route);
}
