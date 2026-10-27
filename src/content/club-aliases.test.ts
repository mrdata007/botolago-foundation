import { describe, expect, test } from "bun:test";
import { CLUB_ALIASES, clubAliasNames, findClubAliases } from "./club-aliases";
import { sportsTeamJsonLd } from "@/lib/structured-data";

/** The clubs `botolago.com/clubs` lists (2026/2027): short name, then the key they must resolve to. */
const LIVE: ReadonlyArray<readonly [string, string]> = [
  ["Amal Tiznit", "usat"],
  ["CODM Meknès", "codm"],
  ["Difaâ El Jadida", "dhj"],
  ["FAR Rabat", "asfar"],
  ["FUS Rabat", "fus"],
  ["Hassania Agadir", "husa"],
  ["Ittihad Tanger", "irt"],
  ["Kawkab Marrakech", "kacm"],
  ["Maghreb Fès", "mas"],
  ["Moghreb Tétouan", "mat"],
  ["Raja Casablanca", "rca"],
  ["Renaissance Club Athletic Zemamra", "rcaz"],
  ["RSB Berkane", "rsb"],
  ["UTS Rabat", "uts"],
  ["Widad Témara", "wst"],
  ["Wydad Casablanca", "wac"],
];

describe("club aliases", () => {
  test("every live club resolves to its own entry, and every entry to a live club", () => {
    for (const [name, key] of LIVE) {
      expect(findClubAliases({ name: { fr: name, ar: "" } })?.key).toBe(key);
    }
    expect(new Set(LIVE.map(([, key]) => key))).toEqual(new Set(CLUB_ALIASES.map((e) => e.key)));
  });

  test("a club is found by its slug alone (Arabic pages)", () => {
    expect(findClubAliases({ slug: "far-rabat-fd6ff8ea898c", name: "الجيش الملكي" })?.key).toBe(
      "asfar",
    );
  });

  test("a club is found by its Arabic name when nothing Latin is left", () => {
    for (const entry of CLUB_ALIASES) {
      expect(findClubAliases({ name: { fr: "", ar: entry.arabic } })?.key).toBe(entry.key);
    }
    expect(findClubAliases({ name: { fr: "", ar: "الوداد الرياضي" } })?.key).toBe("wac");
  });

  test("an unknown club has no aliases", () => {
    expect(findClubAliases({ name: "Olympique de Safi" })).toBeUndefined();
    expect(clubAliasNames({ name: "Olympique de Safi" })).toEqual({ latin: [], arabic: null });
  });

  test("keys and names are unique, and every entry has a name in each script", () => {
    const keys = CLUB_ALIASES.map((e) => e.key);
    expect(new Set(keys).size).toBe(keys.length);
    const all = CLUB_ALIASES.flatMap((e) => [...e.latin, e.arabic]).map((n) => n.toLowerCase());
    expect(new Set(all).size).toBe(all.length);
    for (const entry of CLUB_ALIASES) {
      expect(entry.latin.length).toBeGreaterThan(0);
      expect(entry.arabic).toMatch(/^[؀-ۿ ]+$/);
    }
  });

  test("names the page already shows are not repeated", () => {
    const berkane = { name: { fr: "RSB Berkane", ar: "نهضة بركان" } };
    expect(clubAliasNames(berkane)).toEqual({
      latin: ["RSB", "RS Berkane", "Nahdat Berkane"],
      arabic: "نهضة بركان",
    });
    expect(clubAliasNames(berkane, ["RSB", "نهضة بركان"])).toEqual({
      latin: ["RS Berkane", "Nahdat Berkane"],
      arabic: null,
    });
  });

  test("they reach the SportsTeam alternateName", () => {
    const { latin, arabic } = clubAliasNames({ name: "RSB Berkane" }, ["RSB Berkane"]);
    const ld = sportsTeamJsonLd({
      canonicalUrl: "https://botolago.com/clubs/x",
      name: "RSB Berkane",
      alternateNames: [...latin, arabic],
    });
    expect(ld.alternateName).toEqual(["RSB", "RS Berkane", "Nahdat Berkane", "نهضة بركان"]);
  });
});
