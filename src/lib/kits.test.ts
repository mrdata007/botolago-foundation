import { describe, expect, it } from "bun:test";

import { clubs as mockClubs } from "@/mocks/data";
import type { Club } from "@/types/domain";

import { contrastRatio, parseHex } from "./colour";
import {
  clubIdentityEntries,
  findClubIdentity,
  findClubKit,
  getKitForClub,
  inkOn,
  kitTableEntries,
} from "./kits";

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

  // The 21 production clubs as the football API returns them: the slug is
  // Latin in both languages, the name is in the language asked for. Arabic
  // pages used to match no fragment at all and painted every club in the ink.
  const PRODUCTION: ReadonlyArray<readonly [slug: string, fr: string, ar: string]> = [
    ["amal-tiznit-1ebd788b9f71", "Amal Tiznit", "أمل تيزنيت"],
    ["chabab-mohamm-dia-7ff333801236", "Chabab Mohammédia", "Chabab Mohammédia"],
    ["codm-mekn-s-8059c0cf8b7b", "CODM Meknès", "النادي المكناسي"],
    [
      "cr-khemis-zemamra-dc6fb8196f3e",
      "Renaissance Club Athletic Zemamra",
      "نادي النهضة أتلتيك الزمامرة",
    ],
    ["difa-el-jadida-d5d8c59bf7ab", "Difaâ El Jadida", "الدفاع الحسني الجديدي"],
    ["far-rabat-fd6ff8ea898c", "FAR Rabat", "الجيش الملكي"],
    ["fus-rabat-c499006b2af3", "FUS Rabat", "الفتح الرياضي"],
    ["hassania-agadir-9f8c170d24ed", "Hassania Agadir", "حسنية أكادير"],
    ["ittihad-tanger-353e19d70a4b", "Ittihad Tanger", "اتحاد طنجة"],
    ["js-soualem-318655a9db9f", "JS Soualem", "JS Soualem"],
    ["kawkab-marrakech-d60d9d72cb7a", "Kawkab Marrakech", "الكوكب المراكشي"],
    ["maghreb-f-s-0257feb34c16", "Maghreb Fès", "نادي المغرب الرياضي الفاسي"],
    ["moghreb-t-touan-e3beb52dfbfb", "Moghreb Tétouan", "نادي المغرب أتلتيك تطوان"],
    ["olympic-safi-32fb7b619af4", "Olympic Safi", "Olympic Safi"],
    ["olympique-dche-ra-f2715f0238ed", "Olympique Dcheïra", "Olympique Dcheïra"],
    ["raja-casablanca-3b0f1fc95b29", "Raja Casablanca", "الرجاء الرياضي"],
    ["rsb-berkane-7b2e23bc450f", "RSB Berkane", "نهضة بركان"],
    ["uts-rabat-b78eaee893af", "UTS Rabat", "اتحاد تواركة"],
    ["widad-t-mara-7d508334d7a9", "Widad Témara", "نادي الوداد الرياضي لتمارة"],
    ["wydad-casablanca-80a3fb8202ae", "Wydad Casablanca", "الوداد الرياضي"],
    ["yacoub-el-mansour-e595b91e4d8f", "Yacoub El Mansour", "Yacoub El Mansour"],
  ];
  const asServed = (slug: string, name: string) => ({
    id: "4a1d9c7e-0000-4000-8000-000000000001",
    slug,
    name: { fr: name, ar: name },
    shortName: { fr: name, ar: name },
  });

  it("gives every production club the same kit in Arabic as in French", () => {
    for (const [slug, fr, ar] of PRODUCTION) {
      expect(findClubKit(asServed(slug, ar))?.kit, slug).toEqual(
        findClubKit(asServed(slug, fr))?.kit,
      );
    }
  });

  it("finds a kit for every production club the table knows, from the slug alone", () => {
    const known = PRODUCTION.filter(([slug, fr]) => findClubKit(asServed(slug, fr)));
    // Chabab Mohammédia and JS Soualem have no entry in the table yet.
    expect(known.length).toBe(19);
    for (const [slug] of known) {
      expect(findClubKit({ slug, name: "—" }), slug).toBeDefined();
    }
    expect(findClubKit(asServed("far-rabat-fd6ff8ea898c", "الجيش الملكي"))?.key).toBe("far rabat");
    expect(findClubKit(asServed("moghreb-t-touan-e3beb52dfbfb", "تطوان"))?.kit.primary).toBe(
      "#c00000",
    );
    expect(findClubKit(asServed("widad-t-mara-7d508334d7a9", "تمارة"))?.kit.primary).toBe(
      "#c8102e",
    );
    expect(findClubKit(asServed("maghreb-f-s-0257feb34c16", "فاس"))?.kit.primary).toBe("#ffd400");
  });
});

describe("club identity: one short name and one code per current club", () => {
  // The sixteen 2026/27 clubs exactly as production's team catalog served
  // them on 2026-10-07 (slug; French name, short name and code; Arabic name
  // and short name), and what the app shows for each.
  const CURRENT: ReadonlyArray<{
    slug: string;
    fr: [name: string, short: string, code: string];
    ar: [name: string, short: string];
    shows: [code: string, fr: string, ar: string];
  }> = [
    {
      slug: "amal-tiznit-1ebd788b9f71",
      fr: ["Amal Tiznit", "Amal Tiznit", ""],
      ar: ["أمل تيزنيت", "أمل تيزنيت"],
      shows: ["AMT", "Amal Tiznit", "أمل تيزنيت"],
    },
    {
      slug: "codm-mekn-s-8059c0cf8b7b",
      fr: ["CODM Meknès", "CODM Meknès", ""],
      ar: ["النادي المكناسي", "المكناسي"],
      shows: ["CODM", "CODM Meknès", "النادي المكناسي"],
    },
    {
      slug: "cr-khemis-zemamra-dc6fb8196f3e",
      fr: ["Renaissance Club Athletic Zemamra", "RCA Zemamra", ""],
      ar: ["نادي النهضة أتلتيك الزمامرة", "نهضة الزمامرة"],
      shows: ["RCAZ", "Zemamra", "نهضة الزمامرة"],
    },
    {
      slug: "difa-el-jadida-d5d8c59bf7ab",
      fr: ["Difaâ El Jadida", "Difaâ El Jadida", ""],
      ar: ["الدفاع الحسني الجديدي", "الدفاع الجديدي"],
      shows: ["DHJ", "Difaâ El Jadida", "الدفاع الجديدي"],
    },
    {
      slug: "far-rabat-fd6ff8ea898c",
      fr: ["FAR Rabat", "FAR Rabat", "ASFAR"],
      ar: ["الجيش الملكي", "الجيش"],
      shows: ["FAR", "FAR Rabat", "الجيش الملكي"],
    },
    {
      slug: "fus-rabat-c499006b2af3",
      fr: ["FUS Rabat", "FUS Rabat", "FUS"],
      ar: ["الفتح الرياضي", "الفتح"],
      shows: ["FUS", "FUS Rabat", "الفتح الرباطي"],
    },
    {
      slug: "hassania-agadir-9f8c170d24ed",
      fr: ["Hassania Agadir", "Hassania Agadir", ""],
      ar: ["حسنية أكادير", "حسنية أكادير"],
      shows: ["HUSA", "Hassania Agadir", "حسنية أكادير"],
    },
    {
      slug: "ittihad-tanger-353e19d70a4b",
      fr: ["Ittihad Tanger", "Ittihad Tanger", ""],
      ar: ["اتحاد طنجة", "اتحاد طنجة"],
      shows: ["IRT", "Ittihad Tanger", "اتحاد طنجة"],
    },
    {
      slug: "kawkab-marrakech-d60d9d72cb7a",
      fr: ["Kawkab Marrakech", "Kawkab Marrakech", ""],
      ar: ["الكوكب المراكشي", "الكوكب المراكشي"],
      shows: ["KACM", "Kawkab Marrakech", "الكوكب المراكشي"],
    },
    {
      slug: "maghreb-f-s-0257feb34c16",
      fr: ["Maghreb Fès", "Maghreb Fès", ""],
      ar: ["نادي المغرب الرياضي الفاسي", "المغرب الفاسي"],
      shows: ["MAS", "Maghreb Fès", "المغرب الفاسي"],
    },
    {
      slug: "moghreb-t-touan-e3beb52dfbfb",
      fr: ["Moghreb Tétouan", "Moghreb Tétouan", ""],
      ar: ["نادي المغرب أتلتيك تطوان", "المغرب التطواني"],
      shows: ["MAT", "Moghreb Tétouan", "المغرب التطواني"],
    },
    {
      slug: "raja-casablanca-3b0f1fc95b29",
      fr: ["Raja Casablanca", "Raja Casablanca", "RCA"],
      ar: ["الرجاء الرياضي", "الرجاء"],
      shows: ["RCA", "Raja", "الرجاء"],
    },
    {
      slug: "rsb-berkane-7b2e23bc450f",
      fr: ["RSB Berkane", "RSB Berkane", ""],
      ar: ["نهضة بركان", "نهضة بركان"],
      shows: ["RSB", "RS Berkane", "نهضة بركان"],
    },
    {
      slug: "uts-rabat-b78eaee893af",
      fr: ["UTS Rabat", "UTS Rabat", "UTS"],
      ar: ["اتحاد تواركة", "اتحاد تواركة"],
      shows: ["UTS", "UTS Rabat", "اتحاد تواركة"],
    },
    {
      slug: "widad-t-mara-7d508334d7a9",
      fr: ["Widad Témara", "Widad Témara", ""],
      ar: ["نادي الوداد الرياضي لتمارة", "وداد تمارة"],
      shows: ["WAT", "Widad Témara", "وداد تمارة"],
    },
    {
      slug: "wydad-casablanca-80a3fb8202ae",
      fr: ["Wydad Casablanca", "WCA", "WCA"],
      ar: ["الوداد الرياضي", "الوداد"],
      shows: ["WAC", "Wydad", "الوداد"],
    },
  ];
  const served = (slug: string, name: string, short: string, code = "") => ({
    id: "4a1d9c7e-0000-4000-8000-000000000002",
    slug,
    name,
    shortName: short,
    crestPlaceholder: code,
  });

  it("writes sixteen identities, each code three or four Latin capitals", () => {
    const entries = clubIdentityEntries();
    expect(entries).toHaveLength(16);
    for (const { identity } of entries) expect(identity.code).toMatch(/^[A-Z]{3,4}$/);
  });

  it("never gives two clubs the same code or the same short name, in either language", () => {
    const identities = clubIdentityEntries().map(({ identity }) => identity);
    for (const values of [
      identities.map((identity) => identity.code),
      identities.map((identity) => identity.short.fr),
      identities.map((identity) => identity.short.ar),
    ]) {
      expect(new Set(values).size).toBe(values.length);
    }
  });

  it("writes the Arabic short names in Arabic and the French ones in Latin", () => {
    for (const { identity } of clubIdentityEntries()) {
      expect(identity.short.ar).toMatch(/^[ء-ي ]+$/);
      expect(identity.short.fr).toMatch(/^[\p{Script=Latin} ]+$/u);
    }
  });

  it("finds every current club as production serves it, in French and in Arabic", () => {
    for (const { slug, fr, ar, shows } of CURRENT) {
      const expected = { code: shows[0], short: { fr: shows[1], ar: shows[2] } };
      expect({ slug, identity: findClubIdentity(served(slug, ...fr)) }).toEqual({
        slug,
        identity: expected,
      });
      // In Arabic the names carry no Latin: the slug finds the club.
      expect({ slug, identity: findClubIdentity(served(slug, ...ar)) }).toEqual({
        slug,
        identity: expected,
      });
    }
  });

  it("tells Raja and Zemamra apart, whose letters in the data are both RCA", () => {
    const raja = findClubIdentity(served("raja-casablanca-3b0f1fc95b29", "Raja Casablanca", "RCA"));
    const zemamra = findClubIdentity(
      served("cr-khemis-zemamra-dc6fb8196f3e", "Renaissance Club Athletic Zemamra", "RCA Zemamra"),
    );
    expect([raja?.code, zemamra?.code]).toEqual(["RCA", "RCAZ"]);
  });

  it("leaves a club outside the current season to the data", () => {
    for (const [slug, name] of [
      ["olympic-safi-32fb7b619af4", "Olympic Safi"],
      ["olympique-dche-ra-f2715f0238ed", "Olympique Dcheïra"],
      ["yacoub-el-mansour-e595b91e4d8f", "Yacoub El Mansour"],
      ["chabab-mohamm-dia-7ff333801236", "Chabab Mohammédia"],
      ["js-soualem-318655a9db9f", "JS Soualem"],
    ] as const) {
      expect({ slug, identity: findClubIdentity(served(slug, name, name)) }).toEqual({
        slug,
        identity: undefined,
      });
    }
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
