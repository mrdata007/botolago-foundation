import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The Matches calendar's data wiring (audit 2026-09-25, A05 and A10).
 * Source-level, like `matches-home.option-a.test.ts`: rendering the route
 * needs the router, react-query and i18n together. The decisions themselves
 * are pure functions, tested in `components/matches/match-day-query.test.ts`.
 */

/** Source without comments, so a note that NAMES a rule never satisfies it. */
const code = (file: string) =>
  readFileSync(join(import.meta.dir, file), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("the day's fixtures in the server's HTML (A10)", () => {
  const page = code("matches.index.tsx");

  it("has a loader that warms the seasons, then the opening day, for the server render", () => {
    expect(page).toContain("loaderDeps: ({ search }) => ({ season: search.season })");
    expect(page).toMatch(/loader: \{[\s\S]*?handler: async \(\{ context, deps \}\) =>/);
    expect(page).toMatch(
      /prefetchForSsr\(queryClient, \[\s*\{\s*queryKey: \["football", "seasons", "fr"\]/,
    );
    expect(page).toContain("const season = openingSeason(seasons, deps.season);");
    expect(page).toMatch(
      /prefetchForSsr\(queryClient, \[\s*matchDayQuery\(openingMatchDay\(season, today\), "fr", season\?\.id\),?\s*\]\)/,
    );
  });

  it("decides today once, in the loader, by the competition's calendar", () => {
    expect(page).toContain("const today = matchDayKey(new Date());");
    // With the render's availability (`ssrAvailability`): see the SSR test.
    expect(page).toContain("return { ...ssrAvailability(queryClient), today };");
    expect(page).toContain("const { today } = Route.useLoaderData();");
    expect(page).toContain("openingMatchDay(selectedSeason, today)");
  });

  it("works out the season and the day while rendering, never in an effect after it", () => {
    expect(page).not.toContain("useEffect");
    expect(page).toContain("openingSeason(seasons, requestedSeasonId)");
    expect(page).toContain("matchDayQuery(matchDay, lang, selectedSeason?.id)");
  });
});

describe("the day's rows keep up with the live strip (A05)", () => {
  const page = code("matches.index.tsx");
  const hook = code("../components/matches/use-live-matches.ts");

  it("refreshes the day while something on it moves, never from a hidden tab", () => {
    expect(page).toContain(
      "refetchInterval: (query) => matchDayRefetchInterval(query.state.data?.matches, Date.now())",
    );
    expect(page).toContain("refetchIntervalInBackground: false");
  });

  it("shows the strip's newer reading on the rows, from the strip's own query", () => {
    expect(page).toContain("const liveQ = useLiveMatches();");
    expect(page).toMatch(/withLiveReadings\(\s*\{ matches: matchesQ\.data\?\.matches/);
    expect(page).toMatch(
      /matches\.filter\(\(m\) => sameDay\(new Date\(m\.kickoff\), selectedDate\)\)/,
    );
  });

  it("rereads the day at once when one of its matches leaves the strip", () => {
    // What that does to the cache is `settleEndedMatches`' test, in
    // `match-day-query.test.ts`; here, that the page and the hook call it.
    expect(page).toMatch(
      /useOnLiveMatchEnd\(\(ended, lastReading\) => \{\s*settleEndedMatches\(queryClient, dayQuery\.queryKey, ended, lastReading\);/,
    );
    expect(hook).toContain("latest.current(ended, before)");
  });

  it("keeps the same day's rows through a language switch", () => {
    expect(page).toMatch(
      /placeholderData: \(previous, previousQuery\) =>\s*previousQuery && isSameMatchDayQuery\(previousQuery\.queryKey, dayQuery\.queryKey\)/,
    );
  });
});
