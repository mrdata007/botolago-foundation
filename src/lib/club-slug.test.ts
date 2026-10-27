import { describe, expect, test } from "bun:test";
import {
  buildClubSlugMap,
  clubPath,
  clubPathParam,
  clubSlug,
  isClubUuid,
  resolveClubRef,
  slugifyClubName,
} from "@/lib/club-slug";

const club = (id: string, short: string, full = short) => ({
  id,
  name: { fr: full },
  shortName: { fr: short },
});

// The 21 clubs production returned on 2026-10-27 (short names, French).
const LIVE: readonly [string, string][] = [
  ["Amal Tiznit", "amal-tiznit"],
  ["Chabab Mohammédia", "chabab-mohammedia"],
  ["CODM Meknès", "codm-meknes"],
  ["RCA Zemamra", "rca-zemamra"],
  ["Difaâ El Jadida", "difaa-el-jadida"],
  ["FAR Rabat", "far-rabat"],
  ["FUS Rabat", "fus-rabat"],
  ["Hassania Agadir", "hassania-agadir"],
  ["Ittihad Tanger", "ittihad-tanger"],
  ["JS Soualem", "js-soualem"],
  ["Kawkab Marrakech", "kawkab-marrakech"],
  ["Maghreb Fès", "maghreb-fes"],
  ["Moghreb Tétouan", "moghreb-tetouan"],
  ["Olympic Safi", "olympic-safi"],
  ["Olympique Dcheïra", "olympique-dcheira"],
  ["Raja Casablanca", "raja-casablanca"],
  ["RSB Berkane", "rsb-berkane"],
  ["UTS Rabat", "uts-rabat"],
  ["Widad Témara", "widad-temara"],
  ["WCA", "wca"],
  ["Yacoub El Mansour", "yacoub-el-mansour"],
];

const uuid = (i: number) => `${i.toString(16).padStart(8, "0")}-0000-4000-8000-000000000000`;

describe("club slugs", () => {
  test("fold accents and punctuation into lower-case ASCII words", () => {
    expect(slugifyClubName("Difaâ El Jadida")).toBe("difaa-el-jadida");
    expect(slugifyClubName("  Olympique Dcheïra! ")).toBe("olympique-dcheira");
    expect(slugifyClubName("Stade d’Oujda")).toBe("stade-d-oujda");
    expect(slugifyClubName("الرجاء")).toBe("");
  });

  test("the live league maps to readable, unique slugs", () => {
    const clubs = LIVE.map(([short], i) => club(uuid(i + 1), short));
    const slugs = buildClubSlugMap(clubs);
    expect(clubs.map((c) => slugs.get(c.id))).toEqual(LIVE.map(([, slug]) => slug));
    expect(new Set(slugs.values()).size).toBe(LIVE.length);
  });

  test("the slug comes from the short name, else the full name, else nothing", () => {
    expect(clubSlug(club("a", "RSB Berkane", "Renaissance Sportive de Berkane"))).toBe(
      "rsb-berkane",
    );
    expect(clubSlug({ name: { fr: "Wydad Casablanca" }, shortName: { fr: "" } })).toBe(
      "wydad-casablanca",
    );
    expect(clubSlug(club("a", "الرجاء"))).toBeUndefined();
  });

  test("clubs that share a name keep unique addresses, by id prefix", () => {
    const a = club("aaaaaaaa-0000-4000-8000-000000000000", "Twin FC");
    const b = club("bbbbbbbb-0000-4000-8000-000000000000", "Twin FC");
    const slugs = buildClubSlugMap([a, b, club(uuid(9), "Solo")]);
    expect(slugs.get(a.id)).toBe("twin-fc-aaaaaaaa");
    expect(slugs.get(b.id)).toBe("twin-fc-bbbbbbbb");
    expect(slugs.get(uuid(9))).toBe("solo");
    // The plain slug is ambiguous, so it names no club.
    expect(resolveClubRef("twin-fc", [a, b])).toBeUndefined();
    expect(resolveClubRef("twin-fc-bbbbbbbb", [a, b])).toBe(b);
  });

  test("a segment resolves by slug or by id, in any case", () => {
    const clubs = LIVE.map(([short], i) => club(uuid(i + 1), short));
    const berkane = clubs[16];
    expect(resolveClubRef("rsb-berkane", clubs)).toBe(berkane);
    expect(resolveClubRef("RSB-Berkane", clubs)).toBe(berkane);
    expect(resolveClubRef(berkane.id.toUpperCase(), clubs)).toBe(berkane);
    expect(resolveClubRef("raja", clubs)).toBeUndefined();
    expect(resolveClubRef(uuid(999), clubs)).toBeUndefined();
  });

  test("tells ids from slugs, and builds the path", () => {
    expect(isClubUuid("7b2e23bc-450f-4a1e-9d0c-111111111111")).toBe(true);
    expect(isClubUuid("rsb-berkane")).toBe(false);
    expect(clubPathParam({ id: "x", pathSlug: "rsb-berkane" })).toBe("rsb-berkane");
    expect(clubPathParam({ id: "x" })).toBe("x");
    expect(clubPath("rsb-berkane")).toBe("/clubs/rsb-berkane");
  });
});
