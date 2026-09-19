import { describe, expect, test } from "bun:test";
import type { ArticleCardDto } from "@/backend/news/contracts";
import {
  appendFeedPage,
  deriveCategoryOptions,
  dirFor,
  featuredTreatmentForIndex,
  gradientTokenForId,
  isBreaking,
  presentArticleForDisplay,
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
