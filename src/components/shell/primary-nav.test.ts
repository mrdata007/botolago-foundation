import { describe, expect, it } from "bun:test";

import { MANAGER_CARD_BUILD } from "@/lib/feature-flags";
import {
  curvaInBar,
  isPrimaryRouteActive,
  liveNavItems,
  navItemsFor,
  primaryNavItems,
  useCurvaInBar,
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
  item("/matches"),
  item("/fantasy"),
  item("/news"),
  item("/pepites"),
  item("/curva"),
  item("/profile"),
];
const tos = (items: readonly PrimaryNavItem[]) => items.map((entry) => entry.to);

describe("the fifth slot (Curva, plan 3.3)", () => {
  it("withPepitesSlot never lets Curva in, whatever the other switch says", () => {
    expect(tos(withPepitesSlot(ALL, true))).toEqual([
      "/",
      "/matches",
      "/fantasy",
      "/news",
      "/pepites",
    ]);
    expect(tos(withPepitesSlot(ALL, false))).toEqual([
      "/",
      "/matches",
      "/fantasy",
      "/news",
      "/profile",
    ]);
  });

  it("withFifthSlot: Curva when live, else Pépites when promoted, else Profil", () => {
    const first = ["/", "/matches", "/fantasy", "/news"];
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

  it("Matches is second: Accueil, Matchs, Fantasy, then the rest (owner decision, 2026-10-26)", () => {
    expect(tos(primaryNavItems).slice(0, 3)).toEqual(["/", "/matches", "/fantasy"]);
    expect(tos(liveNavItems).slice(0, 2)).toEqual(["/", "/matches"]);
  });

  it("the shipped list is today's, Curva is in the live one only", () => {
    expect(tos(primaryNavItems)).not.toContain("/curva");
    expect(tos(primaryNavItems)).toContain("/pepites");
    expect(tos(liveNavItems)).toEqual(["/", "/matches", "/fantasy", "/news", "/curva"]);
    expect(liveNavItems.find((entry) => entry.to === "/curva")?.labelKey).toBe("nav.curva");
  });

  it("with the build switch on the bar's hook is the live-aware one", () => {
    // Not called: with the build on it reads the status through React Query, so it needs React.
    expect(MANAGER_CARD_BUILD).toBe(true);
    expect(usePrimaryNavItems.name).toBe("useMemberAwareNavItems");
    expect(useCurvaInBar.name).toBe("useMemberCurvaInBar");
  });
});

// Owner decision 2026-10-28: Curva is for signed-in members only.
describe("who has Curva in the bar (owner decision, 2026-10-28)", () => {
  const STATUSES = ["loading", "guest", "anonymous", "mfa_required", "mfa_unconfirmed"] as const;

  it("is a signed-in member while Curva is live, nobody else", () => {
    expect(curvaInBar(true, "authenticated")).toBe(true);
    for (const status of STATUSES) expect(curvaInBar(true, status)).toBe(false);
  });

  it("is nobody while Curva is not live, members included", () => {
    for (const status of ["authenticated", ...STATUSES] as const) {
      expect(curvaInBar(false, status)).toBe(false);
    }
  });
});

describe("the two bars", () => {
  const head = ["/", "/matches", "/fantasy", "/news"];

  it("signed out: Accueil, Matchs, Fantasy, Actualites, Prospects, with no way to Curva", () => {
    // A visitor, and the session still loading, both read as not in the bar.
    for (const status of ["guest", "anonymous", "loading"] as const) {
      const items = navItemsFor(curvaInBar(true, status));
      expect(tos(items)).toEqual([...head, "/pepites"]);
      expect(tos(items)).not.toContain("/curva");
      expect(items.find((entry) => entry.to === "/pepites")?.labelKey).toBe("nav.pepites");
    }
  });

  it("signed in with Curva live: the fifth tab is Curva", () => {
    const items = navItemsFor(curvaInBar(true, "authenticated"));
    expect(tos(items)).toEqual([...head, "/curva"]);
    expect(tos(items)).not.toContain("/pepites");
  });

  it("signed in with Curva off: the fifth tab is Prospects, the same bar as a visitor's", () => {
    const items = navItemsFor(curvaInBar(false, "authenticated"));
    expect(tos(items)).toEqual([...head, "/pepites"]);
    expect(items).toBe(primaryNavItems);
  });

  it("both bars have five tabs, so the bar's layout does not change with the session", () => {
    expect(primaryNavItems).toHaveLength(5);
    expect(liveNavItems).toHaveLength(5);
  });

  it("has the same labels in French and Arabic for the two fifth tabs", async () => {
    const { dictionaries } = await import("@/i18n/dictionaries");
    expect(dictionaries.fr["nav.pepites"]).toBe("Prospects");
    expect(dictionaries.ar["nav.pepites"]).toBe("المواهب");
    expect(dictionaries.fr["nav.curva"]).toBe("Curva");
    expect(dictionaries.ar["nav.curva"]).toBe("كورفا");
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

  it("a visitor's bar lights Prospects on every /pepites page and never lights Curva", () => {
    for (const path of [
      "/pepites",
      "/pepites/classement",
      "/pepites/comparer",
      "/pepites/methode",
      "/pepites/revelation",
      "/pepites/joueur/abc",
      "/pepites/semaine/4",
    ]) {
      expect(isPrimaryRouteActive(path, "/pepites", false)).toBe(true);
      expect(isPrimaryRouteActive(path, "/fantasy", false)).toBe(false);
    }
    // Nothing is lit on the locked Curva page: Curva is not in a visitor's bar.
    for (const route of ["/", "/matches", "/fantasy", "/news", "/pepites", "/curva"] as const) {
      expect(isPrimaryRouteActive("/curva", route, false)).toBe(false);
    }
  });

  it("with Curva off nothing about /pepites or /curva changes (the default argument)", () => {
    expect(isPrimaryRouteActive("/pepites/classement", "/pepites")).toBe(true);
    expect(isPrimaryRouteActive("/pepites/classement", "/pepites", false)).toBe(true);
    expect(isPrimaryRouteActive("/pepites/classement", "/fantasy")).toBe(false);
    expect(isPrimaryRouteActive("/curva", "/curva")).toBe(false);
  });
});
