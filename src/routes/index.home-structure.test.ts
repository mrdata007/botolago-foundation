import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ar } from "@/i18n/dictionary-ar";
import { fr } from "@/i18n/dictionary-fr";
import { HOME_LIST_SIZE, HOME_MATCHES_LIMIT } from "@/services/football";

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
    // From 768px the sections sit in columns, so the source is grouped by
    // column and the phone order is carried by `order-N` classes. Phone order:
    // matches 3, Pronostics 4, Fantasy 5, news 6, standings 7, discovery 8.
    expect(source).toContain('<Section className="order-3 lg:mt-0">'); // upcoming matches
    expect(source).toContain('<Section className="order-4 lg:order-5">'); // Pronostics
    expect(source).toContain('fantasyFirst ? "-order-1 sm:mt-0" : "order-5"'); // Fantasy
    expect(source).toContain('<Section className="order-6">'); // news
    expect(source).toContain('<Section className="order-7">'); // standings
    expect(source).toContain('<Section className="order-8 pb-2">'); // discovery
    expect([fantasy, news, standings, discovery].every((i) => i > matches)).toBe(true);
  });

  test("the standings snapshot only renders with a real, non-empty table", () => {
    // Must gate on loading/error/non-empty rows, never render an empty
    // fabricated table.
    expect(source).toContain("standingsRows.length > 0");
    expect(source).toContain("showStandings &&");
  });

  test("the standings snapshot says what the Classement tab says under its table", () => {
    // Audit A04: the top five listed four of the fourteen clubs sharing 2nd,
    // with nothing to say their order decides nothing. The notes read the
    // whole table and the five rows shown.
    expect(source).toContain("{standingsTop.map((row) => {");
    expect(source.slice(indexOfOrThrow("<StandingsNotes"))).toMatch(
      /^<StandingsNotes\s+rows=\{standingsRows\}\s+shown=\{standingsTop\}\s+computed=\{standingsQ\.data\.computed\}\s+seasonStatus=\{currentSeason\?\.status\}/,
    );
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

  // Audit 2026-09-25 review: the sr-only H1 was the French `HOME_TITLE`
  // for every reader, so an Arabic screen reader heard French.
  test("the page's only H1 is read in the reader's language, and is the <title> in French", () => {
    expect(source).toContain('<h1 className="sr-only">{t("home.sr_title")}</h1>');
    // What the server renders, and a crawler reads, is unchanged.
    const title = /const HOME_TITLE =\s*"([^"]+)";/.exec(source)?.[1];
    expect(title).toBeTruthy();
    expect(fr["home.sr_title"]).toBe(title as string);
    expect(ar["home.sr_title"]).toMatch(/[؀-ۿ]/);
  });

  /**
   * BG-0155 — the gameweek band swipes through the whole round, so Home's
   * payload carries it; "À venir" keeps the rows it had when the payload held
   * three.
   */
  describe("the payload the band and the list share", () => {
    const service = readFileSync(join(import.meta.dir, "..", "services", "football.ts"), "utf8");

    test("carries a whole round of 8, within the 10 the database function returns", () => {
      expect(HOME_MATCHES_LIMIT).toBeGreaterThanOrEqual(8);
      expect(HOME_MATCHES_LIMIT).toBeLessThanOrEqual(10);
      expect(service).toMatch(/repository\.getHomeMatches\(\s*language,\s*HOME_MATCHES_LIMIT,/);
    });

    test("the band shows the round: one card as before, a carousel when there are more", () => {
      const band = source.slice(indexOfOrThrow("<GameweekBand"), indexOfOrThrow("</GameweekBand>"));
      // From the payload alone, never from Fantasy's gameweek (read in the
      // browser only): the server and the browser show the same cards.
      expect(source).toContain("bandMatches(homeMatches).flatMap(");
      expect(source).not.toMatch(/bandMatches\([^)]*bandGameweek/);
      expect(band).toContain("liveAlone || bandCards.length === 0 ? null");
      expect(band).toContain("bandCards.length === 1 ? (\n                <NextMatchPick");
      expect(band).toMatch(
        /<HomeMatchCarousel\s+cards=\{bandCards\}\s+withVote=\{PRONOSTICS_PROMOTED\}\s+renderedAt=\{renderedAt\}\s*\/>/,
      );
      // The single card holds its vote row only when a vote is expected.
      expect(band).toContain("holdVote={voteMayOpen(bandCards[0]!.match, renderedAt)}");
      // A live match on its own still rises out of the band's lower edge.
      expect(band).toContain("overlap={liveAlone}");
      expect(source).toContain("const liveAlone = bandCards.length === 1 && isInPlay(");
    });

    test("keeps the page's matches on screen while the reader's language loads", () => {
      // An Arabic reader's page switches language after hydration; a round of
      // cards that vanished and came back would shift everything under it.
      const query = source.slice(
        indexOfOrThrow('queryKey: ["football", "home-matches", lang]'),
        indexOfOrThrow("const alertsQ"),
      );
      expect(query).toContain("placeholderData: keepPreviousData");
    });

    test("lists only the payload's first three under À venir", () => {
      expect(HOME_LIST_SIZE).toBe(3);
      expect(source).toContain("homeMatches.slice(0, HOME_LIST_SIZE)");
      expect(source).toMatch(/groupByMatchDay\(\s*listMatches\.filter\(/);
    });
  });

  /**
   * Owner decision 2026-10-07: `/` is Home for everyone. A first visit
   * without an account used to get the landing page in Home's place, with no
   * navigation and the matches thousands of pixels down. The landing page now
   * lives only at `/jouer`, and Home's Fantasy card does the selling.
   */
  describe("`/` is Home for every reader", () => {
    test("the route renders Home itself, with nothing in front of it", () => {
      expect(source).toContain("  component: HomePage,\n");
      // The one component the route names is the Home page, the one that
      // draws the sections above.
      const page = source.slice(indexOfOrThrow("\nfunction HomePage() {"));
      expect(page.indexOf('t("home.live_upcoming")')).toBeGreaterThan(-1);
      expect(source.match(/\nfunction HomePage\(\)/g)).toHaveLength(1);
    });

    test("no first-visit swap: no landing page, welcome check or loading screen", () => {
      for (const gone of [
        "components/landing/LandingPage",
        "LandingFallback",
        "showLanding",
        "hasWelcomed",
        "@/lib/welcome",
        "<Suspense",
        "lazy(",
      ]) {
        expect(source).not.toContain(gone);
      }
    });

    test("the newcomer's way into the game is Home's own Fantasy card", () => {
      // A reader without an account is a device guest: the card offers the
      // builder (or the player list once entries close), as it always has.
      expect(source).toMatch(
        /source === "guest" \? \(\s*<FantasyCreateCard canCreate=\{canCreate\} \/>/,
      );
      const card = readFileSync(
        join(import.meta.dir, "..", "components", "common", "FantasySummaryCard.tsx"),
        "utf8",
      );
      expect(card).toContain('to={canCreate ? "/fantasy/create" : "/fantasy/players"}');
    });

    test("the landing page keeps its own address", () => {
      const jouer = readFileSync(join(import.meta.dir, "jouer.tsx"), "utf8");
      expect(jouer).toContain('createFileRoute("/jouer")');
      expect(jouer).toContain("return <LandingPage onLeave={markWelcomeDone} />;");
    });
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
      const gate = '{NEWS_ENABLED && (\n            <Section className="order-6">';
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
