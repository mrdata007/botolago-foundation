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
