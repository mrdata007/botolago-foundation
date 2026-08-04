import type { TranslationKey } from "@/i18n/dictionaries";

export type FantasyRoute =
  | "/fantasy"
  | "/fantasy/team"
  | "/fantasy/transfers"
  | "/fantasy/points"
  | "/fantasy/leagues"
  | "/fantasy/rankings"
  | "/fantasy/players"
  | "/fantasy/fixtures"
  | "/fantasy/top-players"
  | "/fantasy/rules";

export type FantasyNavItem = {
  to: FantasyRoute;
  labelKey: TranslationKey;
};

export const fantasyPrimaryItems: FantasyNavItem[] = [
  { to: "/fantasy", labelKey: "fantasy.tab.hub" },
  { to: "/fantasy/team", labelKey: "fantasy.tab.team" },
  { to: "/fantasy/points", labelKey: "fantasy.tab.points" },
  { to: "/fantasy/transfers", labelKey: "fantasy.tab.transfers" },
  { to: "/fantasy/leagues", labelKey: "fantasy.tab.leagues" },
];

export const fantasySecondaryItems: FantasyNavItem[] = [
  { to: "/fantasy/top-players", labelKey: "fantasy.tab.top" },
  { to: "/fantasy/rankings", labelKey: "fantasy.tab.rankings" },
  { to: "/fantasy/players", labelKey: "fantasy.tab.players" },
  { to: "/fantasy/fixtures", labelKey: "fantasy.tab.fixtures" },
  { to: "/fantasy/rules", labelKey: "fantasy.tab.rules" },
];

export function isFantasyRouteActive(pathname: string, route: FantasyRoute): boolean {
  return route === "/fantasy" ? pathname === "/fantasy" : pathname.startsWith(route);
}
