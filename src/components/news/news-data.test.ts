import { describe, expect, test } from "bun:test";
import type { ArticleCardDto, NewsTeamFilterDto } from "@/backend/news/contracts";
import { plateTokenForCategory } from "@/components/common/ArticleHeroFallback";
import { clubPalette } from "@/lib/club-palette";
import type { ArticleCategory, Club } from "@/types/domain";
import {
  appendFeedPage,
  bylineInitials,
  clubsForArticle,
  deriveCategoryOptions,
  dirFor,
  featuredTreatmentForIndex,
  formatArticleDate,
  gradientTokenForId,
  isBreaking,
  plateEdgeClass,
  presentArticleForDisplay,
  presentNewsTeam,
  publicNewsContext,
} from "./news-data";

function card(overrides: Partial<ArticleCardDto> = {}): ArticleCardDto {
  return {
    id: "a0000000-0000-4000-8000-000000000001",
    storyId: "b0000000-0000-4000-8000-000000000001",
    language: "fr",
    slug: "slug",
    title: "Titre",
    subtitle: null,
    summary: "Résumé",
    publishedAt: "2026-09-10T10:00:00Z",
    updatedAt: "2026-09-10T10:00:00Z",
    readingTimeMinutes: 3,
    hero: null,
    author: null,
    publisher: null,
    primaryCategory: { id: "c1", slug: "mercato", name: "Mercato" },
    tags: [],
    teamIds: [],
    competitionIds: [],
    placement: null,
    isSaved: false,
    ...overrides,
  };
}

describe("publicNewsContext", () => {
  test("produces a stable, unauthenticated request context", () => {
    const ctx = publicNewsContext();
    expect(ctx.actorId).toBeNull();
    expect(typeof ctx.requestId).toBe("string");
    expect(ctx.requestId.length).toBeGreaterThan(0);
  });
});

describe("deriveCategoryOptions", () => {
  test("collects distinct real categories seen across sources, sorted by name", () => {
    const options = deriveCategoryOptions([
      [card({ primaryCategory: { id: "c1", slug: "analyse", name: "Analyse" } })],
      [
        card({ primaryCategory: { id: "c2", slug: "mercato", name: "Mercato" } }),
        card({ primaryCategory: { id: "c2", slug: "mercato", name: "Mercato" } }),
      ],
    ]);
    expect(options).toEqual([
      { slug: "analyse", name: "Analyse" },
      { slug: "mercato", name: "Mercato" },
    ]);
  });

  test("never fabricates a category when a card has none", () => {
    expect(deriveCategoryOptions([[card({ primaryCategory: null })]])).toEqual([]);
  });

  test("returns an empty list for empty sources instead of a hardcoded tab list", () => {
    expect(deriveCategoryOptions([])).toEqual([]);
    expect(deriveCategoryOptions([[]])).toEqual([]);
  });
});

describe("gradientTokenForId", () => {
  test("is deterministic for the same id", () => {
    const id = "a0000000-0000-4000-8000-000000000042";
    expect(gradientTokenForId(id)).toBe(gradientTokenForId(id));
  });

  test("always resolves to one of the BotolaGO brand gradient tokens", () => {
    const token = gradientTokenForId("some-article-id");
    expect(token).toMatch(/^var\(--news-gradient-(hero|ocean|matchday|aqua|dark|promo)\)$/);
  });
});

describe("presentArticleForDisplay", () => {
  test("overrides the presented gradient with a brand token instead of the legacy two-tone fallback", () => {
    const article = presentArticleForDisplay(card());
    expect(article.heroGradient).toMatch(/^var\(--news-gradient-/);
  });
});

describe("featuredTreatmentForIndex", () => {
  test("gives the first item a hero treatment, the next two compact, the rest row", () => {
    expect(featuredTreatmentForIndex(0)).toBe("hero");
    expect(featuredTreatmentForIndex(1)).toBe("compact");
    expect(featuredTreatmentForIndex(2)).toBe("compact");
    expect(featuredTreatmentForIndex(3)).toBe("row");
    expect(featuredTreatmentForIndex(10)).toBe("row");
  });
});

describe("isBreaking", () => {
  test("only the 'breaking' placement is flagged", () => {
    expect(isBreaking("breaking")).toBe(true);
    expect(isBreaking("editors_pick")).toBe(false);
    expect(isBreaking("trending")).toBe(false);
    expect(isBreaking(null)).toBe(false);
  });
});

describe("appendFeedPage", () => {
  test("appends new items in order", () => {
    const first = [card({ id: "1" }), card({ id: "2" })];
    const second = [card({ id: "3" })];
    expect(appendFeedPage(first, second).map((a) => a.id)).toEqual(["1", "2", "3"]);
  });

  test("de-duplicates overlapping ids instead of rendering the same card twice", () => {
    const first = [card({ id: "1" }), card({ id: "2" })];
    const second = [card({ id: "2" }), card({ id: "3" })];
    expect(appendFeedPage(first, second).map((a) => a.id)).toEqual(["1", "2", "3"]);
  });
});

describe("dirFor", () => {
  test("maps Arabic to rtl and French to ltr", () => {
    expect(dirFor("ar")).toBe("rtl");
    expect(dirFor("fr")).toBe("ltr");
  });
});

function team(overrides: Partial<NewsTeamFilterDto> = {}): NewsTeamFilterDto {
  return {
    id: "c0000000-0000-4000-8000-000000000001",
    slug: "wydad-ac",
    name: "Wydad AC",
    shortName: "WAC",
    city: "Casablanca",
    code: "WAC",
    primaryColor: null,
    secondaryColor: null,
    ...overrides,
  };
}

describe("presentNewsTeam", () => {
  test("a club with no colour in the data is coloured from the kit table, not a stand-in navy", () => {
    // Production has no club colours (BG-0112). The service presenter fills
    // the gap with a literal hex, which the palette would take as the club's
    // own colour; this one leaves it empty so the kit table decides.
    const club = presentNewsTeam(team());
    expect(club.primaryColor).toBe("");
    const palette = clubPalette(club);
    expect(palette.source).toBe("kit");
    expect(palette.key).toBe("wydad");
  });

  test("a real colour in the data is kept and wins over the kit table", () => {
    const club = presentNewsTeam(team({ primaryColor: "#123456", secondaryColor: "#abcdef" }));
    expect(club.primaryColor).toBe("#123456");
    expect(club.secondaryColor).toBe("#abcdef");
    expect(clubPalette(club).source).toBe("data");
  });

  test("keeps the identity the palette and the crest read", () => {
    const club = presentNewsTeam(team({ city: null, code: null, shortName: "Raja" }));
    expect(club.slug).toBe("wydad-ac");
    expect(club.name).toEqual({ fr: "Wydad AC", ar: "Wydad AC" });
    expect(club.city).toEqual({ fr: "", ar: "" });
    expect(club.crestPlaceholder).toBe("RAJ");
  });
});

describe("plateEdgeClass", () => {
  const CATEGORIES: ArticleCategory[] = [
    "for_you",
    "latest",
    "transfers",
    "analysis",
    "interviews",
  ];

  test("draws the category's own plate colour, the token the hero plate uses", () => {
    for (const category of CATEGORIES) {
      const edge = plateEdgeClass(category);
      expect(edge).toContain("border-s-4");
      expect(edge).toContain(`border-s-[color:var(${plateTokenForCategory(category)})]`);
    }
  });

  test("falls back to the brand foreground in dark, where the plates measure ~1.2:1", () => {
    for (const category of CATEGORIES) {
      expect(plateEdgeClass(category)).toContain("dark:border-s-[color:var(--ui-ink-fg)]");
    }
  });

  test("uses a logical edge only, so it mirrors in Arabic", () => {
    for (const category of CATEGORIES) {
      expect(plateEdgeClass(category)).not.toMatch(/\bborder-(l|r)(-|\b)/);
    }
  });
});

describe("clubsForArticle", () => {
  const club = (id: string): Club => ({
    id,
    name: { fr: id, ar: id },
    shortName: { fr: id, ar: id },
    city: { fr: "", ar: "" },
    primaryColor: "",
    crestPlaceholder: id.toUpperCase(),
  });
  const directory = [club("a"), club("b"), club("c")];

  test("follows the article's order, not the directory's: the first club colours the card", () => {
    expect(clubsForArticle(["c", "a"], directory).map((entry) => entry.id)).toEqual(["c", "a"]);
  });

  test("skips an id the directory does not know instead of inventing a club", () => {
    expect(clubsForArticle(["x", "b"], directory).map((entry) => entry.id)).toEqual(["b"]);
    expect(clubsForArticle(["a"], [])).toEqual([]);
  });
});

describe("bylineInitials", () => {
  test("takes the first letter of the first and the last word", () => {
    expect(bylineInitials("Youssef Amrani")).toBe("YA");
    expect(bylineInitials("  jean-pierre de la tour ")).toBe("JT");
  });

  test("a single word gives a single initial", () => {
    expect(bylineInitials("BotolaGO")).toBe("B");
  });

  test("an Arabic name gives one letter: two joined letters would read as a word", () => {
    expect(bylineInitials("يوسف العمراني")).toBe("ي");
  });

  test("an empty name gives no initials", () => {
    expect(bylineInitials("   ")).toBe("");
  });
});

describe("formatArticleDate", () => {
  test("prints the date without the time, in the reader's language", () => {
    expect(formatArticleDate("2026-09-23T12:00:00Z", "fr")).toBe("23 sept. 2026");
    const ar = formatArticleDate("2026-09-23T12:00:00Z", "ar");
    expect(ar).toContain("23");
    expect(ar).toContain("2026");
    expect(ar).toMatch(/\p{Script=Arabic}/u);
  });

  test("an invalid date prints nothing", () => {
    expect(formatArticleDate("not a date", "fr")).toBe("");
  });
});
