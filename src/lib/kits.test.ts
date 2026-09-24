import { describe, expect, it } from "bun:test";

import { clubs as mockClubs } from "@/mocks/data";
import type { Club } from "@/types/domain";

import { contrastRatio, parseHex } from "./colour";
import { findClubKit, getKitForClub, inkOn, kitTableEntries } from "./kits";

/**
 * The kit table colours the Fantasy shirts in production (every production
 * club has a null `primary_color`) and is the club palette's second source.
 */

const club = (overrides: Partial<Club> & Pick<Club, "name">): Club => ({
  id: "3f2c1a9e-0000-4000-8000-000000000000",
  shortName: overrides.name,
  city: { fr: "", ar: "" },
  primaryColor: "var(--ui-ink)",
  crestPlaceholder: "",
  ...overrides,
});

describe("findClubKit", () => {
  it("matches a mock club by id", () => {
    for (const mock of mockClubs) {
      expect(findClubKit(mock)?.key).toBe(mock.id);
    }
  });

  it("matches by slug when the id is a UUID (the mock football repository)", () => {
    expect(
      findClubKit({ id: "4a1d9c7e-0000-4000-8000-000000000005", slug: "rsb", name: "RS Berkane" })
        ?.key,
    ).toBe("rsb");
  });

  it("puts Tétouan before the Maghreb fragment it also contains", () => {
    // The bug this fixes: "Maghreb Tétouan" matched `maghreb` first and wore
    // Maghreb de Fès's yellow.
    const tetouan = findClubKit(club({ name: { fr: "Maghreb Tétouan", ar: "المغرب التطواني" } }));
    expect(tetouan?.key).toBe("tétouan");
    expect(tetouan?.kit.primary).toBe("#c00000");
    expect(findClubKit(club({ name: { fr: "Moghreb Tétouan", ar: "" } }))?.key).toBe("tétouan");
    expect(findClubKit(club({ name: { fr: "Maghreb Fès", ar: "" } }))?.kit.primary).toBe("#ffd400");
  });

  it("finds nothing for an unknown club", () => {
    expect(findClubKit(club({ name: { fr: "Club Inconnu", ar: "" } }))).toBeUndefined();
  });
});

describe("getKitForClub", () => {
  it("keeps the kit for a mock club", () => {
    const wac = getKitForClub(mockClubs.find((c) => c.id === "war"));
    expect(wac).toEqual({
      pattern: "solid",
      primary: "#c8102e",
      secondary: "#ffffff",
      ink: "#ffffff",
    });
  });

  it("paints the mock-football Tétouan red, not yellow", () => {
    const mat = mockClubs.find((c) => c.id === "mat")!;
    expect(getKitForClub({ ...mat, id: "uuid-mat", slug: "mat" }).primary).toBe("#c00000");
    expect(getKitForClub({ ...mat, id: "uuid-mat", slug: undefined }).primary).toBe("#c00000");
  });

  it("returns the default navy kit without a club", () => {
    expect(getKitForClub(undefined)).toEqual({
      pattern: "solid",
      primary: "#1a3a7a",
      secondary: "#ffffff",
      ink: "#ffffff",
    });
  });

  it("falls back to the club's own colour for a club outside the table", () => {
    const kit = getKitForClub(club({ name: { fr: "Club Inconnu", ar: "" } }));
    expect(kit.primary).toBe("var(--ui-ink)");
    expect(kit.ink).toBe("#ffffff");
  });

  it("honours a pattern override", () => {
    expect(getKitForClub(mockClubs[0], "stripes-vertical").pattern).toBe("stripes-vertical");
  });
});

describe("inkOn — WCAG, not YIQ", () => {
  it("picks the text colour with the higher contrast on every kit colour", () => {
    for (const { kit } of kitTableEntries()) {
      for (const colour of [kit.primary, kit.secondary]) {
        const fill = parseHex(colour)!;
        const chosen = contrastRatio(fill, parseHex(inkOn(colour))!);
        const other = contrastRatio(
          fill,
          parseHex(inkOn(colour) === "#ffffff" ? "#111111" : "#ffffff")!,
        );
        expect(chosen).toBeGreaterThanOrEqual(other);
      }
    }
  });

  it("puts dark text on the oranges YIQ put white on", () => {
    // YIQ ≥ 150 said white for Hassania's #e63900 (4.24:1, against 4.45 for
    // the near-black), Berkane's #e63946 (4.17 / 4.53) and its production
    // orange #f26522 (3.15 / 5.99).
    expect(inkOn("#e63900")).toBe("#111111");
    expect(inkOn("#e63946")).toBe("#111111");
    expect(inkOn("#f26522")).toBe("#111111");
    expect(inkOn("#f28e00")).toBe("#111111");
    expect(inkOn("#c8102e")).toBe("#ffffff");
  });

  it("gives a non-hex fill (the ink fallback) white", () => {
    expect(inkOn("var(--ui-ink)")).toBe("#ffffff");
  });
});
