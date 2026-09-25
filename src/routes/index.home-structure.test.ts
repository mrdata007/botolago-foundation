import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * BG-0012 — Accueil (Home) redesign structural contract.
 *
 * The route-ownership map (docs/engineering/tasks/BG-0012/redesign-route-ownership.md)
 * fixes Accueil's section order: greeting → matches → Fantasy gameweek entry →
 * curated News preview → standings snapshot (only with real data) → discovery
 * links. This is a lightweight source-shape check (not a full render test,
 * which would need to mock react-query/router/i18n) that guards the order and
 * a couple of hard "do not reproduce the News page" rules from regressing.
 */
const source = readFileSync(join(import.meta.dir, "index.tsx"), "utf8");

function indexOfOrThrow(needle: string): number {
  const i = source.indexOf(needle);
  if (i === -1) throw new Error(`expected to find ${JSON.stringify(needle)} in routes/index.tsx`);
  return i;
}

describe("Accueil (Home) structural contract", () => {
  test("sections appear in the required order", () => {
    const greeting = indexOfOrThrow('t("home.greeting_morning")'); // useGreeting()
    const matches = indexOfOrThrow('t("home.live_upcoming")');
    const fantasy = indexOfOrThrow('t("home.fantasy_hub")');
    const news = indexOfOrThrow('t("home.news_preview")');
    const standings = indexOfOrThrow('t("matches.table_preview")');
    const discovery = indexOfOrThrow('t("home.explore")');

    expect(greeting).toBeLessThan(matches);
    expect(matches).toBeLessThan(fantasy);
    expect(fantasy).toBeLessThan(news);
    expect(news).toBeLessThan(standings);
    expect(standings).toBeLessThan(discovery);
  });

  test("the standings snapshot only renders with a real, non-empty table", () => {
    // Must gate on loading/error/non-empty rows, never render an empty
    // fabricated table.
    expect(source).toContain("standingsRows.length > 0");
    expect(source).toContain("showStandings &&");
  });

  test("the news preview links into /news instead of duplicating it", () => {
    expect(source).toContain('<ViewAllLink to="/news"');
    // No per-language article fetch control on Home — that belongs to /news.
    expect(source).not.toContain("news.language");
    expect(source).not.toContain("newsLanguage");
  });

  test("discovery links cover Matches, Fantasy, News and Profile", () => {
    expect(source).toContain('to="/matches"');
    expect(source).toContain('to="/fantasy"');
    expect(source).toContain('to="/news"');
    expect(source).toContain('to="/profile"');
  });

  /**
   * BG-0091 — News is hidden at launch. The section and the discovery tile
   * above stay in the source (this is a hide, not a deletion) but both must be
   * behind `NEWS_ENABLED`, and Home must not fetch a News edition while the
   * flag is off. These assertions are what stops the rail reappearing by
   * accident; they are satisfied by the flag being honoured, not by its value.
   */
  describe("News is gated on NEWS_ENABLED", () => {
    test("Home imports the flag", () => {
      expect(source).toContain('import { NEWS_ENABLED } from "@/lib/feature-flags"');
    });

    test("the news preview section is behind the flag", () => {
      const gate = "{NEWS_ENABLED && (\n        <Section>";
      expect(source).toContain(gate);
      // …and the section behind it is the News preview, not another one.
      const gated = source.slice(source.indexOf(gate), source.indexOf(gate) + 160);
      expect(gated).toContain('t("home.news_preview")');
    });

    test("the news discovery tile is behind the flag", () => {
      expect(source).toContain(
        '{NEWS_ENABLED && <DiscoveryLink to="/news" icon={Newspaper} label={t("nav.news")} />}',
      );
    });

    // Two call sites since the server renders the home page with its news
    // (the loader's prefetch) as well as the page's own query: each must be
    // gated on the flag.
    test("the news edition is not fetched while the flag is off", () => {
      const page = source.slice(source.indexOf("queryFn: () => newsService.getEdition(lang"));
      expect(page.slice(0, 120)).toContain("enabled: NEWS_ENABLED");
      const loader = source.slice(0, source.indexOf("head: () => ({"));
      const prefetch = loader.indexOf('newsService.getEdition("fr", "auto")');
      expect(prefetch).toBeGreaterThan(-1);
      expect(loader.slice(0, prefetch)).toContain("...(NEWS_ENABLED");
      expect(source.split("newsService.getEdition(").length - 1).toBe(2);
    });
  });
});
