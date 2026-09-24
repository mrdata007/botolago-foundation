import { describe, expect, test } from "bun:test";

import { clubLabel, clubToken, findClub, isClubKey } from "./club-identity";
import type { Club } from "@/types/domain";

const club = (over: Partial<Club>): Club => ({
  id: "00000000-0000-4000-8000-000000000001",
  slug: "war",
  name: { fr: "Wydad AC", ar: "الوداد" },
  shortName: { fr: "Wydad AC", ar: "الوداد" },
  city: { fr: "Casablanca", ar: "الدار البيضاء" },
  primaryColor: "var(--ui-ink)",
  crestPlaceholder: "WAC",
  ...over,
});

const tr = (value: { fr: string; ar: string }) => value.fr;

describe("isClubKey / findClub — a Fantasy row's club key, matched on id or slug", () => {
  const wydad = club({});
  const raja = club({
    id: "00000000-0000-4000-8000-000000000002",
    slug: "rca",
    name: { fr: "Raja CA", ar: "الرجاء" },
    shortName: { fr: "Raja CA", ar: "الرجاء" },
    crestPlaceholder: "RCA",
  });
  const clubs = [wydad, raja];

  test("a cloud row keys the club by its UUID", () => {
    expect(findClub(clubs, raja.id)).toBe(raja);
  });

  test("a mock row keys the club by its source slug", () => {
    expect(findClub(clubs, "rca")).toBe(raja);
    expect(isClubKey(wydad, "war")).toBe(true);
  });

  test("an id match wins over a slug match", () => {
    const collide = club({ id: "rca", slug: "other", crestPlaceholder: "XYZ" });
    expect(findClub([raja, collide], "rca")).toBe(collide);
  });

  test("an unknown or empty key matches nothing", () => {
    expect(findClub(clubs, "fus")).toBeUndefined();
    expect(findClub(clubs, "")).toBeUndefined();
    expect(findClub(clubs, undefined)).toBeUndefined();
    expect(findClub(undefined, "war")).toBeUndefined();
    expect(isClubKey(club({ slug: undefined }), "war")).toBe(false);
  });
});

describe("clubLabel / clubToken", () => {
  test("the label never repeats the crest token", () => {
    expect(clubLabel(club({ shortName: { fr: "WAC", ar: "WAC" } }), tr)).toBe("Wydad AC");
    expect(clubLabel(club({}), tr)).toBe("Wydad AC");
  });

  test("a broken short token is rebuilt from whole words", () => {
    expect(
      clubToken(club({ crestPlaceholder: "JS ", name: { fr: "JS Soualem", ar: "" } }), tr),
    ).toBe("JSS");
    expect(clubToken(club({}), tr)).toBe("WAC");
  });
});
