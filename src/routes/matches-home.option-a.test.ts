import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Option A (A-Home, A-Matches) — the page-level decisions a later edit could
 * quietly undo. Source-level, like `index.home-structure.test.ts`: rendering
 * these routes needs react-query, the router, auth and i18n together. The
 * cards themselves are rendered for real in `MatchCard.option-a.test.tsx`.
 */

/** Source without comments, so a note that NAMES a rule never satisfies it. */
const code = (file: string) =>
  readFileSync(join(import.meta.dir, file), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("Home (A-Home)", () => {
  const home = code("index.tsx");

  it("draws a live match as the split club-colour card, and the rest as rows in a card", () => {
    expect(home).toMatch(/liveMatches\.map\([\s\S]*?variant="hero"/);
    expect(home).toMatch(/variant="list"/);
    // The card of rows clips the club edge bars to its corners.
    expect(home).toMatch(/<UiCard[\s\S]{0,120}overflow-hidden[\s\S]{0,200}day\.matches\.map/);
  });

  it("follows a live score at the live strip's pace, and watches a match about to kick off", () => {
    // The cadence itself is `matchesRefetchInterval`, tested in
    // src/lib/match-refresh.test.ts: 30s while live, 60s near kick-off, else none.
    expect(home).toMatch(
      /refetchInterval: \(query\) => matchesRefetchInterval\(query\.state\.data\?\.matches, Date\.now\(\)\)/,
    );
  });

  it("puts the Fantasy deadline on the band as the gradient pill, named for Fantasy", () => {
    expect(home).toContain(
      '<DeadlineCountdown iso={deadline} label={t("home.deadline_fantasy")} />',
    );
  });

  it("runs the band's scrim to the bottom — never a physical angle", () => {
    expect(home).toContain("linear-gradient(to bottom");
    expect(home).not.toMatch(/to (left|right)\b|\d+deg/);
  });

  it("shows the Fantasy card and the create-a-team card, never an invented rank movement", () => {
    expect(home).toContain("<FantasySummaryCard summary={summaryQ.data} />");
    expect(home).toContain("<FantasyCreateCard canCreate={canCreate} />");
    expect(home).not.toContain("previousRank");
  });

  it("never breaks a club name inside a word", () => {
    expect(home).not.toMatch(/break-words|break-all|overflow-wrap:anywhere/);
  });
});

describe("Matches (A-Matches)", () => {
  const matches = code("matches.index.tsx");

  it("titles the page with the white UiPageTitle band and the season as a soft pill", () => {
    expect(matches).toContain("<UiPageTitle");
    expect(matches).not.toContain("PhotoPageHeader");
    expect(matches).not.toContain("CompetitionHeader");
  });

  it("stacks title, tabs, live strip and status chips in that order, the strip drawn once", () => {
    const title = matches.indexOf("<UiPageTitle");
    const tabs = matches.indexOf('<MatchesTabs active="calendar" season={selectedSeason} />');
    const strip = matches.indexOf("<LiveStrip />");
    const chips = matches.indexOf("<StatusFilters");
    expect(title).toBeGreaterThan(-1);
    expect(tabs).toBeGreaterThan(title);
    expect(strip).toBeGreaterThan(tabs);
    expect(chips).toBeGreaterThan(strip);
    // AppShell would draw a second strip after the whole header.
    expect(matches).not.toMatch(/<AppShell[^>]*\bliveStrip\b/);
  });

  it("sticks the chips under the top bar and the live strip, moving with the strip", () => {
    expect(matches).toContain("sticky top-[calc(var(--topbar-h)+var(--livestrip-h))]");
    expect(matches).toContain("transition-[top]");
  });

  it("keeps all four status filters as one named group of chips", () => {
    for (const key of [
      "matches.tab.all",
      "matches.tab.live",
      "matches.tab.upcoming",
      "matches.tab.results",
    ]) {
      expect(matches).toContain(`"${key}"`);
    }
    expect(matches).toContain('role="group"');
    expect(matches).toContain('aria-label={t("matches.a11y.status_filters")}');
    expect(matches).toContain("<UiChip");
  });

  it("lists the day's matches as club-colour rows, results under their own heading", () => {
    expect(matches).toMatch(/variant="list"/);
    expect(matches).toContain('title={t("matches.section.finished")}');
  });

  it("leaves the table to the Classement tab rather than closing the page with it", () => {
    expect(matches).not.toContain("StandingsTable");
    expect(matches).not.toContain("standings");
  });
});

describe("Classement (A-Standings)", () => {
  const standings = code("matches.standings.tsx");
  const home = code("index.tsx");

  it("is the second Matches tab: same title band and season pill, tabs, then the live strip", () => {
    const title = standings.indexOf("<UiPageTitle");
    const picker = standings.indexOf("<SeasonPicker");
    const tabs = standings.indexOf('<MatchesTabs active="standings" season={season} />');
    const strip = standings.indexOf("<LiveStrip />");
    expect(title).toBeGreaterThan(-1);
    expect(picker).toBeGreaterThan(title);
    expect(tabs).toBeGreaterThan(picker);
    expect(strip).toBeGreaterThan(tabs);
    expect(standings).toContain('createFileRoute("/matches/standings")');
  });

  it("keeps the season a reader chose when they switch tabs, both ways", () => {
    const calendar = code("matches.index.tsx");
    const tabs = code("../components/matches/MatchesTabs.tsx");
    for (const page of [calendar, standings]) {
      expect(page).toContain("validateSearch: validateMatchesSearch");
      expect(page).toContain("const { season: requestedSeasonId } = Route.useSearch();");
    }
    expect(standings).toContain("useState<string | null>(() => requestedSeasonId ?? null)");
    expect(calendar).toContain("seasons.find((season) => season.id === requestedSeasonId)");
    expect(tabs).toContain("search: seasonSearch(season)");
  });

  it("reads the table worked out from the season's results, shared with Home's snapshot", () => {
    expect(standings).toContain('queryKey: ["football", "standings", season?.id, lang]');
    expect(standings).toContain("footballService.getStandings(season!, lang)");
    expect(home).toContain('queryKey: ["football", "standings", currentSeason?.id, lang]');
    expect(home).toContain('<ViewAllLink to="/matches/standings" />');
  });

  it("shows the reader's club only when they have one and it is in the table", () => {
    expect(standings).toContain("findClub(data?.clubs, user?.favoriteClubId)");
    expect(standings).toMatch(/favourite && favouriteStanding \? \(\s*<YourClubCard/);
  });

  it("keys the zone bars only under the season table, never under home or away", () => {
    expect(standings).toContain(
      'shown === "overall" || shown === "form" ? <StandingsLegend /> : null',
    );
  });

  it("offers last season's table while this one has no result yet", () => {
    expect(standings).toContain("data.overall.length === 0");
    expect(standings).toContain("<EmptyState illustration={standingsSoonArt}>");
    expect(standings).toContain("setSeasonId(previous.id)");
  });

  it("keeps the four views as one named group of chips", () => {
    expect(standings).toContain('role="group"');
    expect(standings).toContain('aria-label={t("standings.a11y.views")}');
    for (const key of [
      "standings.view.overall",
      "standings.view.home",
      "standings.view.away",
      "matches.table.form",
    ]) {
      expect(standings).toContain(`"${key}"`);
    }
  });
});

describe("Classement — design-system rules in source", () => {
  const FILES = [
    "matches.standings.tsx",
    "../components/matches/MatchesTabs.tsx",
    "../components/matches/matches-search.ts",
    "../components/matches/SeasonPicker.tsx",
    "../components/matches/StandingsTable.tsx",
    "../components/matches/YourClubCard.tsx",
    "../components/matches/standings-copy.ts",
  ];
  for (const file of FILES) {
    const source = code(file);
    it(`${file}: logical properties, ltr-only tracking, no literal colour`, () => {
      expect(source).not.toMatch(
        /["'`\s](?:m[lr]|p[lr]|border-[lr]|rounded-[lr]|rounded-(?:tl|tr|bl|br)|text-(?:left|right))(?:-|\b)/,
      );
      expect(source).not.toMatch(/["'`\s]-?(?:left|right)-(?:\d|\[|1\/2|full|px)/);
      expect(source).not.toMatch(/(?<!ltr:)tracking-/);
      expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(source).not.toMatch(/\brgba?\(/);
      expect(source).not.toMatch(/(?:text|ring|border)-\[color:var\(--ui-ink\)\]/);
      expect(source).not.toMatch(/gradient\([^)]*\d+deg/);
    });
  }
});
