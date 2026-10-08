import { describe, expect, it } from "bun:test";

import {
  isPrimaryRouteActive,
  liveNavItems,
  primaryNavItems,
  usePrimaryNavItems,
  withFifthSlot,
  withPepitesSlot,
  type PrimaryNavItem,
} from "./primary-nav";

describe("isPrimaryRouteActive", () => {
  it("lights Home on / only", () => {
    expect(isPrimaryRouteActive("/", "/")).toBe(true);
    expect(isPrimaryRouteActive("/matches", "/")).toBe(false);
  });

  it("keeps Matches lit on Pronostics, which has no slot of its own (BG-0146)", () => {
    expect(isPrimaryRouteActive("/matches/standings", "/matches")).toBe(true);
    expect(isPrimaryRouteActive("/pronostics", "/matches")).toBe(true);
    expect(isPrimaryRouteActive("/pronostics/ligues/abc", "/matches")).toBe(true);
    expect(isPrimaryRouteActive("/pronostics", "/fantasy")).toBe(false);
  });
});

describe("the Pépites slot", () => {
  it("takes Profil's place only once promoted", async () => {
    const { withPepitesSlot } = await import("./primary-nav");
    const items = [
      { to: "/" as const, labelKey: "nav.home" as const, icon: () => null },
      { to: "/pepites" as const, labelKey: "nav.pepites" as const, icon: () => null },
      { to: "/profile" as const, labelKey: "nav.profile" as const, icon: () => null },
    ];
    expect(withPepitesSlot(items, false).map((item) => item.to)).toEqual(["/", "/profile"]);
    expect(withPepitesSlot(items, true).map((item) => item.to)).toEqual(["/", "/pepites"]);
  });

  it("lights Pépites on its player and week pages", () => {
    expect(isPrimaryRouteActive("/pepites/joueur/abc", "/pepites")).toBe(true);
    expect(isPrimaryRouteActive("/pepites/semaine/4", "/matches")).toBe(false);
  });
});

const item = (to: PrimaryNavItem["to"]): PrimaryNavItem => ({
  to,
  labelKey: "nav.home",
  icon: () => null,
});
const ALL = [
  item("/"),
  item("/news"),
  item("/fantasy"),
  item("/matches"),
  item("/pepites"),
  item("/gradins"),
  item("/profile"),
];
const tos = (items: readonly PrimaryNavItem[]) => items.map((entry) => entry.to);

describe("the fifth slot (Gradins, plan 3.3)", () => {
  it("withPepitesSlot never lets Gradins in, whatever the other switch says", () => {
    expect(tos(withPepitesSlot(ALL, true))).toEqual([
      "/",
      "/news",
      "/fantasy",
      "/matches",
      "/pepites",
    ]);
    expect(tos(withPepitesSlot(ALL, false))).toEqual([
      "/",
      "/news",
      "/fantasy",
      "/matches",
      "/profile",
    ]);
  });

  it("withFifthSlot: Gradins when live, else Pépites when promoted, else Profil", () => {
    const first = ["/", "/news", "/fantasy", "/matches"];
    expect(tos(withFifthSlot(ALL, { pepitesPromoted: true, gradinsLive: true }))).toEqual([
      ...first,
      "/gradins",
    ]);
    expect(tos(withFifthSlot(ALL, { pepitesPromoted: false, gradinsLive: true }))).toEqual([
      ...first,
      "/gradins",
    ]);
    expect(tos(withFifthSlot(ALL, { pepitesPromoted: true, gradinsLive: false }))).toEqual([
      ...first,
      "/pepites",
    ]);
    expect(tos(withFifthSlot(ALL, { pepitesPromoted: false, gradinsLive: false }))).toEqual([
      ...first,
      "/profile",
    ]);
  });

  it("the shipped list is today's, Gradins is in the live one only", () => {
    expect(tos(primaryNavItems)).not.toContain("/gradins");
    expect(tos(primaryNavItems)).toContain("/pepites");
    expect(tos(liveNavItems)).toEqual(["/", "/news", "/fantasy", "/matches", "/gradins"]);
    expect(liveNavItems.find((entry) => entry.to === "/gradins")?.labelKey).toBe("nav.gradins");
  });

  it("with the build switch off the bar's hook hands back the very same array", () => {
    // Called outside React on purpose: with the build off it is a plain function, no hook.
    expect(usePrimaryNavItems()).toBe(primaryNavItems);
  });
});

describe("isPrimaryRouteActive with Gradins live (plan 3.3)", () => {
  it("lights Fantasy on every /pepites page, and Pépites on none", () => {
    for (const path of [
      "/pepites",
      "/pepites/classement",
      "/pepites/joueur/abc",
      "/pepites/semaine/4",
    ]) {
      expect(isPrimaryRouteActive(path, "/fantasy", true)).toBe(true);
      expect(isPrimaryRouteActive(path, "/pepites", true)).toBe(false);
    }
  });

  it("lights Gradins on its own pages", () => {
    expect(isPrimaryRouteActive("/gradins", "/gradins", true)).toBe(true);
    expect(isPrimaryRouteActive("/gradins/carte", "/gradins", true)).toBe(true);
    expect(isPrimaryRouteActive("/gradins/carte", "/fantasy", true)).toBe(false);
  });

  it("leaves Fantasy's own pages and the other tabs alone", () => {
    expect(isPrimaryRouteActive("/fantasy/team", "/fantasy", true)).toBe(true);
    expect(isPrimaryRouteActive("/matches", "/matches", true)).toBe(true);
    expect(isPrimaryRouteActive("/pronostics", "/matches", true)).toBe(true);
    expect(isPrimaryRouteActive("/", "/", true)).toBe(true);
    expect(isPrimaryRouteActive("/fantasy", "/", true)).toBe(false);
  });

  it("with Gradins off nothing about /pepites or /gradins changes (the default argument)", () => {
    expect(isPrimaryRouteActive("/pepites/classement", "/pepites")).toBe(true);
    expect(isPrimaryRouteActive("/pepites/classement", "/pepites", false)).toBe(true);
    expect(isPrimaryRouteActive("/pepites/classement", "/fantasy")).toBe(false);
    expect(isPrimaryRouteActive("/gradins", "/gradins")).toBe(false);
  });
});
