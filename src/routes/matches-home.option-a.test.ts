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

  it("stacks title, live strip and status chips in that order, the strip drawn once", () => {
    const title = matches.indexOf("<UiPageTitle");
    const strip = matches.indexOf("<LiveStrip />");
    const chips = matches.indexOf("<StatusFilters");
    expect(title).toBeGreaterThan(-1);
    expect(strip).toBeGreaterThan(title);
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
});
