import { describe, expect, it } from "bun:test";

import { isPrimaryRouteActive } from "./primary-nav";

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
