import { describe, expect, test } from "bun:test";
import type { Club } from "@/types/domain";
import { articleKicker, isGenericCategory } from "./article-kicker";
import { linkArticleToFixture, type NewsFixture } from "./news-fixtures";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-10-25T12:00:00Z");
const iso = (offsetDays: number) => new Date(NOW + offsetDays * DAY).toISOString();

const fixture = (over: Partial<NewsFixture> = {}): NewsFixture => ({
  id: "f1",
  homeClubId: "A",
  awayClubId: "B",
  kickoff: iso(1),
  status: "scheduled",
  ...over,
});

describe("linkArticleToFixture", () => {
  test("a preview published before kick-off is a preview", () => {
    const link = linkArticleToFixture({ clubIds: ["B", "A"], publishedAt: iso(0) }, [fixture()]);
    expect(link?.kind).toBe("preview");
    // Home and away are the fixture's, not the article's order.
    expect(link?.homeClubId).toBe("A");
    expect(link?.awayClubId).toBe("B");
  });

  test("a report after a finished fixture carries the final score", () => {
    const link = linkArticleToFixture({ clubIds: ["A", "B"], publishedAt: iso(0) }, [
      fixture({ kickoff: iso(-1), status: "finished", homeScore: 0, awayScore: 1 }),
    ]);
    expect(link).toMatchObject({ kind: "result", homeScore: 0, awayScore: 1 });
  });

  test("a finished fixture without a score is never drawn with one", () => {
    const link = linkArticleToFixture({ clubIds: ["A", "B"], publishedAt: iso(0) }, [
      fixture({ kickoff: iso(-1), status: "finished" }),
    ]);
    expect(link?.kind).toBe("match");
    expect(link?.homeScore).toBeUndefined();
  });

  test("a fixture outside the window is not linked", () => {
    expect(
      linkArticleToFixture({ clubIds: ["A", "B"], publishedAt: iso(0) }, [
        fixture({ kickoff: iso(10) }),
      ]),
    ).toBeNull();
    expect(
      linkArticleToFixture({ clubIds: ["A", "B"], publishedAt: iso(0) }, [
        fixture({ kickoff: iso(-30), status: "finished", homeScore: 1, awayScore: 1 }),
      ]),
    ).toBeNull();
  });

  test("the nearest of two legs wins", () => {
    const link = linkArticleToFixture({ clubIds: ["A", "B"], publishedAt: iso(0) }, [
      fixture({ id: "far", kickoff: iso(3), homeClubId: "B", awayClubId: "A" }),
      fixture({ id: "near", kickoff: iso(1) }),
    ]);
    expect(link?.homeClubId).toBe("A");
  });

  test("only a story that names exactly two clubs is linked", () => {
    expect(linkArticleToFixture({ clubIds: ["A"], publishedAt: iso(0) }, [fixture()])).toBeNull();
    expect(
      linkArticleToFixture({ clubIds: ["A", "B", "C"], publishedAt: iso(0) }, [fixture()]),
    ).toBeNull();
  });

  test("a postponed or called-off fixture is not a link", () => {
    expect(
      linkArticleToFixture({ clubIds: ["A", "B"], publishedAt: iso(0) }, [
        fixture({ status: "postponed" }),
      ]),
    ).toBeNull();
    expect(
      linkArticleToFixture({ clubIds: ["A", "B"], publishedAt: iso(0) }, [
        fixture({ calledOff: true }),
      ]),
    ).toBeNull();
  });

  test("no fixtures, no link", () => {
    expect(
      linkArticleToFixture({ clubIds: ["A", "B"], publishedAt: iso(0) }, undefined),
    ).toBeNull();
  });
});

describe("articleKicker", () => {
  const club = { id: "A" } as Club;
  const base = { clubs: [club], clubCount: 1, fixture: null };

  test("the generic categories never label a story", () => {
    expect(isGenericCategory("latest")).toBe(true);
    expect(isGenericCategory("for_you")).toBe(true);
    expect(isGenericCategory("transfers")).toBe(false);
    expect(articleKicker({ ...base, clubs: [], clubCount: 0, category: "latest" })).toBeNull();
  });

  test("order: tag, fixture, real category, the club, nothing", () => {
    const preview = linkArticleToFixture({ clubIds: ["A", "B"], publishedAt: iso(0) }, [fixture()]);
    expect(articleKicker({ ...base, tag: { fr: "x", ar: "x" }, category: "transfers" })?.type).toBe(
      "tag",
    );
    expect(articleKicker({ ...base, category: "transfers", fixture: preview })).toEqual({
      type: "fixture",
      key: "news.kicker.preview",
    });
    expect(articleKicker({ ...base, category: "transfers" })?.type).toBe("category");
    expect(articleKicker({ ...base, category: "latest" })?.type).toBe("club");
  });

  test("a club name is used only for a story about exactly one club", () => {
    expect(
      articleKicker({ clubs: [club], clubCount: 2, fixture: null, category: "latest" }),
    ).toBeNull();
  });
});
