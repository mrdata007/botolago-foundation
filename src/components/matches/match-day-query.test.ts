import { afterEach, describe, expect, test } from "bun:test";
import { dehydrate, hydrate, QueryClient, QueryObserver } from "@tanstack/react-query";

import { matchDayKey } from "@/lib/match-kickoff";
import { KICKOFF_WAKE_UP_HORIZON_MINUTES } from "@/lib/match-refresh";
import { prefetchForSsr, SSR_DEHYDRATE_OPTIONS } from "@/lib/ssr-prefetch";
import { defaultSeason, footballService, type FootballSeason } from "@/services/football";
import type { Match } from "@/types/domain";
import {
  clampMatchDay,
  isSameMatchDayQuery,
  JUST_FINISHED_REFRESH_MINUTES,
  matchDayQuery,
  matchDayRefetchInterval,
  openingMatchDay,
  settleEndedMatches,
  withLiveReadings,
} from "./match-day-query";

const at = (iso: string) => Date.parse(iso);
const minutes = (n: number) => n * 60_000;

describe("how often the day on show refreshes itself", () => {
  const kickoff = "2026-09-26T20:00:00Z";

  test("every 30 seconds while one of its matches is in play", () => {
    expect(matchDayRefetchInterval([{ status: "live", kickoff }], at(kickoff) + minutes(50))).toBe(
      30_000,
    );
  });

  test("every minute from a quarter of an hour before a kick-off, until the feed starts it", () => {
    const scheduled = [{ status: "scheduled" as const, kickoff }];
    expect(matchDayRefetchInterval(scheduled, at(kickoff) - minutes(14))).toBe(60_000);
    // Past kick-off and still "scheduled": the provider has not flipped it yet.
    expect(matchDayRefetchInterval(scheduled, at(kickoff) + minutes(5))).toBe(60_000);
    expect(matchDayRefetchInterval(scheduled, at(kickoff) + minutes(181))).toBe(false);
  });

  test("before that, a kick-off later in the day books one refetch for when its watch opens", () => {
    const scheduled = [{ status: "scheduled" as const, kickoff }];
    // Opened at 18:00 on a 20:00 kick-off: the next read is at 19:45.
    expect(matchDayRefetchInterval(scheduled, at(kickoff) - minutes(120))).toBe(minutes(105));
    // Never sooner than the watch's own pace, however close the watch is.
    expect(matchDayRefetchInterval(scheduled, at(kickoff) - minutes(15) - 500)).toBe(60_000);
    // A kick-off more than a day away books nothing.
    expect(
      matchDayRefetchInterval(
        scheduled,
        at(kickoff) - minutes(15) - minutes(KICKOFF_WAKE_UP_HORIZON_MINUTES),
      ),
    ).toBe(minutes(KICKOFF_WAKE_UP_HORIZON_MINUTES));
    expect(
      matchDayRefetchInterval(
        scheduled,
        at(kickoff) - minutes(15) - minutes(KICKOFF_WAKE_UP_HORIZON_MINUTES) - 1,
      ),
    ).toBe(false);
  });

  test("a match that has just finished keeps the day refreshing, so its final score arrives", () => {
    const finished = [{ status: "finished" as const, kickoff }];
    // The whistle about 1 h 55 after kick-off; a correction can follow it.
    expect(matchDayRefetchInterval(finished, at(kickoff) + minutes(115))).toBe(60_000);
    expect(
      matchDayRefetchInterval(finished, at(kickoff) + minutes(JUST_FINISHED_REFRESH_MINUTES)),
    ).toBe(60_000);
    expect(
      matchDayRefetchInterval(finished, at(kickoff) + minutes(JUST_FINISHED_REFRESH_MINUTES + 1)),
    ).toBe(false);
  });

  test("a past day never polls, even with a match the feed left marked live", () => {
    const now = at("2026-09-25T12:00:00Z");
    expect(
      matchDayRefetchInterval(
        [
          { status: "finished", kickoff: "2026-09-20T18:00:00Z" },
          { status: "live", kickoff: "2026-09-20T20:00:00Z" },
          { status: "scheduled", kickoff: "2026-09-20T16:00:00Z" },
          { status: "postponed", kickoff: "2026-09-20T00:00:00Z" },
        ],
        now,
      ),
    ).toBe(false);
    // Three hours past kick-off is where "live" stops counting.
    expect(matchDayRefetchInterval([{ status: "live", kickoff }], at(kickoff) + minutes(179))).toBe(
      30_000,
    );
    expect(matchDayRefetchInterval([{ status: "live", kickoff }], at(kickoff) + minutes(181))).toBe(
      false,
    );
  });

  test("a day further ahead never polls", () => {
    expect(
      matchDayRefetchInterval(
        [
          { status: "scheduled", kickoff: "2026-10-03T19:00:00Z" },
          { status: "scheduled", kickoff: "2026-10-03T21:00:00Z" },
        ],
        at("2026-09-25T12:00:00Z"),
      ),
    ).toBe(false);
  });

  test("the day asks for the shortest interval any of its matches needs", () => {
    expect(
      matchDayRefetchInterval(
        [
          { status: "finished", kickoff: "2026-09-26T16:00:00Z" },
          { status: "live", kickoff: "2026-09-26T18:00:00Z" },
          { status: "scheduled", kickoff: "2026-09-26T20:00:00Z" },
        ],
        at("2026-09-26T19:50:00Z"),
      ),
    ).toBe(30_000);
  });

  // Midnight UTC, 01:00 in Casablanca: the hour the provider gives a fixture
  // whose kick-off time is still to be announced (`isKickoffTimeUnconfirmed`).
  test("a kick-off still at the provider's placeholder hour is not watched through the night", () => {
    const unconfirmed = [{ status: "scheduled" as const, kickoff: "2026-09-27T00:00:00Z" }];
    // The afternoon before: no refetch booked for 00:45.
    expect(matchDayRefetchInterval(unconfirmed, at("2026-09-26T11:00:00Z"))).toBe(false);
    // Around the placeholder itself: no watch either.
    expect(matchDayRefetchInterval(unconfirmed, at("2026-09-26T23:50:00Z"))).toBe(false);
    expect(matchDayRefetchInterval(unconfirmed, at("2026-09-27T02:30:00Z"))).toBe(false);
    // One minute off the hour is a real kick-off, watched as any other.
    expect(
      matchDayRefetchInterval(
        [{ status: "scheduled", kickoff: "2026-09-27T00:01:00Z" }],
        at("2026-09-26T23:50:00Z"),
      ),
    ).toBe(60_000);
  });

  test("nothing to go on: no polling", () => {
    expect(matchDayRefetchInterval(undefined, at(kickoff))).toBe(false);
    expect(matchDayRefetchInterval([], at(kickoff))).toBe(false);
    expect(matchDayRefetchInterval([{ status: "live", kickoff: "tbd" }], at(kickoff))).toBe(false);
    expect(matchDayRefetchInterval([{ status: "postponed", kickoff }], at(kickoff))).toBe(false);
  });
});

describe("the day the calendar opens on", () => {
  const season = {
    startsOn: "2026-07-01",
    endsOn: "2027-06-30",
    firstMatchDate: "2026-09-12",
    lastMatchDate: "2027-06-05",
  };

  test("today while the season is on, its first day included and its last", () => {
    expect(openingMatchDay(season, "2026-09-25")).toBe("2026-09-25");
    expect(openingMatchDay(season, "2026-07-01")).toBe("2026-07-01");
    expect(openingMatchDay(season, "2027-06-30")).toBe("2027-06-30");
  });

  test("the first match day of a season still to start, the last of one that is over", () => {
    expect(openingMatchDay(season, "2026-06-15")).toBe("2026-09-12");
    expect(openingMatchDay(season, "2027-08-01")).toBe("2027-06-05");
    const unscheduled = { ...season, firstMatchDate: null, lastMatchDate: null };
    expect(openingMatchDay(unscheduled, "2026-06-15")).toBe("2026-07-01");
    expect(openingMatchDay(unscheduled, "2027-08-01")).toBe("2027-06-30");
  });

  test("today, with no season to go by", () => {
    expect(openingMatchDay(undefined, "2026-09-25")).toBe("2026-09-25");
  });

  // The server's clock is UTC; the competition's days are Casablanca's
  // (UTC+1 outside Ramadan). At 23:30 UTC it is already tomorrow there.
  test("today is the competition's day, not the server's", () => {
    expect(openingMatchDay(season, matchDayKey(new Date("2026-09-25T23:30:00Z")))).toBe(
      "2026-09-26",
    );
    expect(openingMatchDay(season, matchDayKey(new Date("2026-09-25T22:59:00Z")))).toBe(
      "2026-09-25",
    );
  });

  test("a day the reader picks stays inside the season on show", () => {
    expect(clampMatchDay("2026-06-01", season)).toBe("2026-07-01");
    expect(clampMatchDay("2027-07-01", season)).toBe("2027-06-30");
    expect(clampMatchDay("2026-10-04", season)).toBe("2026-10-04");
    expect(clampMatchDay("2026-10-04", undefined)).toBe("2026-10-04");
  });
});

describe("the live strip's reading on the day's rows", () => {
  const row = (id: string, fields: Partial<Match> = {}): Match => ({
    id,
    gameweek: 3,
    homeClubId: `${id}-home`,
    awayClubId: `${id}-away`,
    kickoff: "2026-09-26T20:00:00Z",
    status: "live",
    venue: { fr: "Stade", ar: "Stade" },
    ...fields,
  });

  test("a newer reading gives the row the strip's score, minute and status", () => {
    const day = [row("a", { minute: 55, homeScore: 0, awayScore: 0 }), row("b")];
    const live = [row("a", { minute: 57, homeScore: 1, awayScore: 0, halfTimeHomeScore: 0 })];
    const [a, b] = withLiveReadings(
      { matches: day, updatedAt: 1_000 },
      { matches: live, updatedAt: 2_000 },
    );
    expect(a).toMatchObject({ minute: 57, homeScore: 1, awayScore: 0, halfTimeHomeScore: 0 });
    expect(a?.venue).toBe(day[0]!.venue);
    // A match the strip does not follow is the day's.
    expect(b).toBe(day[1]!);
  });

  test("a match the strip picks up at kick-off shows as live on its row at once", () => {
    const day = [row("a", { status: "scheduled" })];
    const live = [row("a", { minute: 1, homeScore: 0, awayScore: 0 })];
    const [a] = withLiveReadings(
      { matches: day, updatedAt: 1_000 },
      { matches: live, updatedAt: 2_000 },
    );
    expect(a?.status).toBe("live");
    expect(a?.minute).toBe(1);
  });

  test("an older reading never overwrites the day's: the list refetched after the strip", () => {
    const day = [row("a", { status: "finished", homeScore: 2, awayScore: 1 })];
    const live = [row("a", { minute: 90, homeScore: 1, awayScore: 1 })];
    expect(
      withLiveReadings({ matches: day, updatedAt: 3_000 }, { matches: live, updatedAt: 2_000 }),
    ).toBe(day);
  });

  test("never adds a match to the day, and leaves it untouched with nothing live", () => {
    const day = [row("a", { status: "scheduled" })];
    expect(
      withLiveReadings(
        { matches: day, updatedAt: 1_000 },
        { matches: [row("z")], updatedAt: 2_000 },
      ),
    ).toBe(day);
    expect(
      withLiveReadings({ matches: day, updatedAt: 1_000 }, { matches: [], updatedAt: 2_000 }),
    ).toBe(day);
    expect(withLiveReadings({ matches: day, updatedAt: 1_000 }, undefined)).toBe(day);
  });
});

describe("a match leaving the strip, on the day's cache", () => {
  const row = (id: string, fields: Partial<Match> = {}): Match => ({
    id,
    gameweek: 3,
    homeClubId: `${id}-home`,
    awayClubId: `${id}-away`,
    kickoff: "2026-09-26T19:00:00Z",
    status: "live",
    venue: { fr: "Stade", ar: "Stade" },
    ...fields,
  });
  const collection = (matches: Match[]) => ({ matches, clubs: [], standings: [] });
  const saturday = matchDayQuery("2026-09-26", "fr", "s1").queryKey;
  const sunday = matchDayQuery("2026-09-27", "fr", "s1").queryKey;
  const clients: QueryClient[] = [];
  afterEach(() => {
    for (const created of clients.splice(0)) created.clear();
  });
  function cache() {
    const client = new QueryClient();
    clients.push(client);
    // The day's rows read at 1 000, then the strip at 2 000: the whistle
    // has gone and the strip had a late goal the day's read had not.
    client.setQueryData(
      saturday,
      collection([row("a", { minute: 88, homeScore: 1, awayScore: 1 }), row("b")]),
      { updatedAt: 1_000 },
    );
    client.setQueryData(sunday, collection([row("c", { status: "scheduled" })]), {
      updatedAt: 1_000,
    });
    return client;
  }
  const lastReading = {
    matches: [row("a", { minute: 90, homeScore: 2, awayScore: 1 }), row("b", { minute: 30 })],
    updatedAt: 2_000,
  };
  type Day = ReturnType<typeof collection>;

  test("rereads the day it was on at once, and no other day", () => {
    const client = cache();
    expect(settleEndedMatches(client, saturday, ["a"], lastReading)).toBe(true);
    expect(client.getQueryState(saturday)?.isInvalidated).toBe(true);
    expect(client.getQueryState(sunday)?.isInvalidated).toBe(false);

    // The same news on a page showing Sunday: nothing of Sunday's ended.
    const other = cache();
    expect(settleEndedMatches(other, sunday, ["a"], lastReading)).toBe(false);
    expect(other.getQueryState(sunday)?.isInvalidated).toBe(false);
    expect(other.getQueryState(saturday)?.isInvalidated).toBe(false);
  });

  test("until that read lands, the rows keep the strip's last word, stamped with its time", () => {
    const client = cache();
    settleEndedMatches(client, saturday, ["a"], lastReading);
    const [a, b] = client.getQueryData<Day>(saturday)!.matches;
    // Not the day's 88th minute at 1-1: the 90th, at 2-1, as the row last showed.
    expect(a).toMatchObject({ minute: 90, homeScore: 2, awayScore: 1 });
    expect(b).toMatchObject({ minute: 30 });
    // The strip's time, so its next reading of `b`, still in play, stays the newer one.
    expect(client.getQueryState(saturday)?.dataUpdatedAt).toBe(2_000);
  });

  test("a day read after the strip keeps its own reading, and is still reread", () => {
    const client = cache();
    const before = client.getQueryData<Day>(saturday);
    settleEndedMatches(client, saturday, ["a"], { ...lastReading, updatedAt: 500 });
    expect(client.getQueryData<Day>(saturday)).toBe(before);
    expect(client.getQueryState(saturday)?.dataUpdatedAt).toBe(1_000);
    expect(client.getQueryState(saturday)?.isInvalidated).toBe(true);
  });

  test("a day not loaded yet has nothing to settle", () => {
    const client = new QueryClient();
    clients.push(client);
    expect(settleEndedMatches(client, saturday, ["a"], lastReading)).toBe(false);
  });
});

describe("the day's query", () => {
  test("is keyed by the day, the season and the language, under the football matches key", () => {
    expect(matchDayQuery("2026-09-26", "fr", "season-1").queryKey).toEqual([
      "football",
      "matches",
      "2026-09-26",
      "season-1",
      "fr",
    ]);
    expect(matchDayQuery("2026-09-26", "ar", undefined).queryKey).toEqual([
      "football",
      "matches",
      "2026-09-26",
      "default",
      "ar",
    ]);
  });

  test("asks the backend for that competition day", async () => {
    const original = footballService.getMatchDay;
    const asked: [string, string, string | undefined][] = [];
    footballService.getMatchDay = async (date, language, seasonId) => {
      asked.push([matchDayKey(date), language, seasonId]);
      return { matches: [], clubs: [], standings: [] };
    };
    try {
      await matchDayQuery("2026-09-26", "ar", "season-1").queryFn();
    } finally {
      footballService.getMatchDay = original;
    }
    expect(asked).toEqual([["2026-09-26", "ar", "season-1"]]);
  });

  test("names the same day of the same season in either language, and nothing else", () => {
    const french = matchDayQuery("2026-09-26", "fr", "season-1").queryKey;
    expect(
      isSameMatchDayQuery(french, matchDayQuery("2026-09-26", "ar", "season-1").queryKey),
    ).toBe(true);
    expect(isSameMatchDayQuery(french, french)).toBe(true);
    expect(
      isSameMatchDayQuery(french, matchDayQuery("2026-09-27", "ar", "season-1").queryKey),
    ).toBe(false);
    expect(
      isSameMatchDayQuery(french, matchDayQuery("2026-09-26", "ar", "season-2").queryKey),
    ).toBe(false);
    expect(isSameMatchDayQuery(french, ["football", "live-matches", "ar"])).toBe(false);
  });

  // The page's `placeholderData`, on a query observer as `useQuery` drives it.
  test("keeps the rows up through a language switch, never under another day", () => {
    const client = new QueryClient();
    const options = (day: string, language: "fr" | "ar") => {
      const query = matchDayQuery(day, language, "season-1");
      return {
        queryKey: query.queryKey,
        queryFn: () => new Promise<never>(() => {}),
        placeholderData: (
          previous: unknown,
          previousQuery: { queryKey: readonly unknown[] } | undefined,
        ) =>
          previousQuery && isSameMatchDayQuery(previousQuery.queryKey, query.queryKey)
            ? previous
            : undefined,
      };
    };
    const french = { matches: [], clubs: [], standings: [] };
    client.setQueryData(options("2026-09-26", "fr").queryKey, french);
    const observer = new QueryObserver(client, options("2026-09-26", "fr"));
    const unsubscribe = observer.subscribe(() => {});
    try {
      observer.setOptions(options("2026-09-26", "ar"));
      expect(observer.getCurrentResult()).toMatchObject({
        data: french,
        isPlaceholderData: true,
        isPending: false,
      });
      observer.setOptions(options("2026-09-27", "ar"));
      expect(observer.getCurrentResult()).toMatchObject({ data: undefined, isPending: true });
    } finally {
      unsubscribe();
      client.clear();
    }
  });
});

// The route's loader and the page each build the day's query from the
// seasons and the loader's `today`; the fixtures the server loaded have to be
// under the key the browser's first render asks for, or it shows a skeleton
// and fetches them again.
describe("the fixtures the server renders reach the browser's first render", () => {
  const globals = globalThis as { window?: unknown };
  const hadWindow = "window" in globals;
  const originalWindow = globals.window;
  const clients: QueryClient[] = [];
  afterEach(() => {
    for (const created of clients.splice(0)) created.clear();
    if (hadWindow) globals.window = originalWindow;
    else delete globals.window;
  });

  test("same season, same day, same key", async () => {
    const seasons: FootballSeason[] = [
      {
        id: "current",
        competitionId: "botola",
        label: "2026/27",
        startsOn: "2026-07-01",
        endsOn: "2027-06-30",
        status: "active",
        isCurrent: true,
        firstMatchDate: "2026-09-12",
        lastMatchDate: null,
        competitionName: "Botola Pro",
      },
    ];
    const fixtures = { matches: [], clubs: [], standings: [] };
    const today = matchDayKey(new Date("2026-09-25T23:30:00Z"));

    delete globals.window;
    const server = new QueryClient();
    clients.push(server);
    await prefetchForSsr(server, [
      { queryKey: ["football", "seasons", "fr"], queryFn: async () => seasons },
    ]);
    const loaded = server.getQueryData<FootballSeason[]>(["football", "seasons", "fr"])!;
    const season = defaultSeason(loaded);
    await prefetchForSsr(server, [
      {
        queryKey: matchDayQuery(openingMatchDay(season, today), "fr", season?.id).queryKey,
        queryFn: async () => fixtures,
      },
    ]);

    const browser = new QueryClient();
    clients.push(browser);
    hydrate(browser, JSON.parse(JSON.stringify(dehydrate(server, SSR_DEHYDRATE_OPTIONS))));
    const shown = defaultSeason(
      browser.getQueryData<FootballSeason[]>(["football", "seasons", "fr"])!,
    );
    const key = matchDayQuery(openingMatchDay(shown, today), "fr", shown?.id).queryKey;
    expect(key).toEqual(["football", "matches", "2026-09-26", "current", "fr"]);
    expect(browser.getQueryData(key)).toEqual(fixtures);
  });
});
