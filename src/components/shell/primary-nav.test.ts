import { describe, expect, it } from "bun:test";

import { MANAGER_CARD_BUILD } from "@/lib/feature-flags";
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
  item("/curva"),
  item("/profile"),
];
const tos = (items: readonly PrimaryNavItem[]) => items.map((entry) => entry.to);

describe("the fifth slot (Curva, plan 3.3)", () => {
  it("withPepitesSlot never lets Curva in, whatever the other switch says", () => {
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

  it("withFifthSlot: Curva when live, else Pépites when promoted, else Profil", () => {
    const first = ["/", "/news", "/fantasy", "/matches"];
    expect(tos(withFifthSlot(ALL, { pepitesPromoted: true, curvaLive: true }))).toEqual([
      ...first,
      "/curva",
    ]);
    expect(tos(withFifthSlot(ALL, { pepitesPromoted: false, curvaLive: true }))).toEqual([
      ...first,
      "/curva",
    ]);
    expect(tos(withFifthSlot(ALL, { pepitesPromoted: true, curvaLive: false }))).toEqual([
      ...first,
      "/pepites",
    ]);
    expect(tos(withFifthSlot(ALL, { pepitesPromoted: false, curvaLive: false }))).toEqual([
      ...first,
      "/profile",
    ]);
  });

  it("the shipped list is today's, Curva is in the live one only", () => {
    expect(tos(primaryNavItems)).not.toContain("/curva");
    expect(tos(primaryNavItems)).toContain("/pepites");
    expect(tos(liveNavItems)).toEqual(["/", "/news", "/fantasy", "/matches", "/curva"]);
    expect(liveNavItems.find((entry) => entry.to === "/curva")?.labelKey).toBe("nav.curva");
  });

  it("with the build switch on the bar's hook is the live-aware one", () => {
    // Not called: with the build on it reads the status through React Query, so it needs React.
    expect(MANAGER_CARD_BUILD).toBe(true);
    expect(usePrimaryNavItems.name).toBe("useLiveAwareNavItems");
  });
});

describe("isPrimaryRouteActive with Curva live (plan 3.3)", () => {
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

  it("lights Curva on its own pages", () => {
    expect(isPrimaryRouteActive("/curva", "/curva", true)).toBe(true);
    expect(isPrimaryRouteActive("/curva/carte", "/curva", true)).toBe(true);
    expect(isPrimaryRouteActive("/curva/carte", "/fantasy", true)).toBe(false);
  });

  it("leaves Fantasy's own pages and the other tabs alone", () => {
    expect(isPrimaryRouteActive("/fantasy/team", "/fantasy", true)).toBe(true);
    expect(isPrimaryRouteActive("/matches", "/matches", true)).toBe(true);
    expect(isPrimaryRouteActive("/pronostics", "/matches", true)).toBe(true);
    expect(isPrimaryRouteActive("/", "/", true)).toBe(true);
    expect(isPrimaryRouteActive("/fantasy", "/", true)).toBe(false);
  });

  it("with Curva off nothing about /pepites or /curva changes (the default argument)", () => {
    expect(isPrimaryRouteActive("/pepites/classement", "/pepites")).toBe(true);
    expect(isPrimaryRouteActive("/pepites/classement", "/pepites", false)).toBe(true);
    expect(isPrimaryRouteActive("/pepites/classement", "/fantasy")).toBe(false);
    expect(isPrimaryRouteActive("/curva", "/curva")).toBe(false);
  });
});
