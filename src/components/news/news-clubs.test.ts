import { describe, expect, test } from "bun:test";
import type { Club } from "@/types/domain";
import { currentSeasonClubs, overlayClubNames } from "./news-clubs";

const club = (id: string, name: string, crestUrl?: string): Club => ({
  id,
  slug: id,
  name: { fr: name, ar: name },
  shortName: { fr: name, ar: name },
  city: { fr: "", ar: "" },
  primaryColor: "",
  crestPlaceholder: id,
  crestUrl,
});

describe("overlayClubNames", () => {
  test("takes the directory's (Arabic) names and keeps the news row's crest", () => {
    const news = [club("a", "Amal Tiznit", "crest.png"), club("gone", "Yacoub El Mansour")];
    const directory = [club("a", "أمل تيزنيت")];
    const [amal, former] = overlayClubNames(news, directory);
    expect(amal.name.ar).toBe("أمل تيزنيت");
    expect(amal.shortName.ar).toBe("أمل تيزنيت");
    expect(amal.crestUrl).toBe("crest.png");
    // A club the directory no longer lists keeps its news name.
    expect(former.name.ar).toBe("Yacoub El Mansour");
  });
});

describe("currentSeasonClubs", () => {
  const news = [club("a", "A"), club("b", "B"), club("gone", "Gone")];

  test("keeps only the clubs of the current season", () => {
    const row = currentSeasonClubs(news, { season: {}, clubs: [club("a", "A"), club("b", "B")] });
    expect(row.map((c) => c.id)).toEqual(["a", "b"]);
  });

  test("with no season (the whole catalogue) or no directory, there is no row", () => {
    expect(currentSeasonClubs(news, { season: null, clubs: news })).toEqual([]);
    expect(currentSeasonClubs(news, undefined)).toEqual([]);
  });
});
