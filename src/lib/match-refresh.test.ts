import { afterEach, describe, expect, test } from "bun:test";
import { QueryClient, QueryObserver } from "@tanstack/react-query";

import { matchDayRefetchInterval } from "@/components/matches/match-day-query";
import type { Match } from "@/types/domain";
import {
  KICKOFF_WAKE_UP_HORIZON_MINUTES,
  LIVE_STRIP_IDLE_REFRESH_MS,
  liveStripRefetchInterval,
  matchesRefetchInterval,
  matchRefetchInterval,
  rereadTableOnFinish,
} from "./match-refresh";

const minutes = (n: number) => n * 60_000;

describe("matchRefetchInterval", () => {
  const kickoff = "2026-09-24T19:00:00Z";
  const at = (iso: string) => Date.parse(iso);

  test("every 30 seconds while live", () => {
    expect(matchRefetchInterval({ status: "live", kickoff }, at(kickoff))).toBe(30_000);
  });

  test("every minute from 15 minutes before a scheduled kick-off", () => {
    expect(matchRefetchInterval({ status: "scheduled", kickoff }, at("2026-09-24T18:46:00Z"))).toBe(
      60_000,
    );
    // Past kick-off and still "scheduled": the provider has not flipped it yet.
    expect(matchRefetchInterval({ status: "scheduled", kickoff }, at("2026-09-24T19:05:00Z"))).toBe(
      60_000,
    );
  });

  test("before that, books the one refetch that starts the watch, when it starts", () => {
    // Opened at 17:00 on a 19:00 kick-off: the next read is at 18:45. A page
    // nothing re-rendered used to sit unrefreshed through the kick-off.
    expect(matchRefetchInterval({ status: "scheduled", kickoff }, at("2026-09-24T17:00:00Z"))).toBe(
      minutes(105),
    );
    // A minute before the watch opens: the read at 18:45.
    expect(matchRefetchInterval({ status: "scheduled", kickoff }, at("2026-09-24T18:44:00Z"))).toBe(
      60_000,
    );
    // Never sooner than the watch's own pace, however close the watch is.
    expect(
      matchRefetchInterval({ status: "scheduled", kickoff }, at("2026-09-24T18:44:59.500Z")),
    ).toBe(60_000);
  });

  test("books nothing for a kick-off more than a day away", () => {
    const watchOpens = at(kickoff) - minutes(15);
    const horizon = minutes(KICKOFF_WAKE_UP_HORIZON_MINUTES);
    expect(matchRefetchInterval({ status: "scheduled", kickoff }, watchOpens - horizon)).toBe(
      horizon,
    );
    expect(matchRefetchInterval({ status: "scheduled", kickoff }, watchOpens - horizon - 1)).toBe(
      false,
    );
  });

  test("stops three hours past kick-off, and never for finished or postponed matches", () => {
    expect(matchRefetchInterval({ status: "scheduled", kickoff }, at("2026-09-24T22:01:00Z"))).toBe(
      false,
    );
    expect(matchRefetchInterval({ status: "finished", kickoff }, at(kickoff))).toBe(false);
    expect(matchRefetchInterval({ status: "postponed", kickoff }, at(kickoff))).toBe(false);
    expect(matchRefetchInterval(undefined, at(kickoff))).toBe(false);
    expect(matchRefetchInterval({ status: "scheduled", kickoff: "tbd" }, at(kickoff))).toBe(false);
    // A postponed match a few hours ahead books nothing either.
    expect(matchRefetchInterval({ status: "postponed", kickoff }, at("2026-09-24T12:00:00Z"))).toBe(
      false,
    );
  });

  // Midnight UTC, 01:00 in Casablanca: the hour the provider gives a fixture
  // whose kick-off time is still to be announced (`isKickoffTimeUnconfirmed`).
  describe("a kick-off still at the provider's placeholder hour", () => {
    const unconfirmed = { status: "scheduled" as const, kickoff: "2026-09-27T00:00:00Z" };

    test("is not watched through the night, nor woken for", () => {
      // The afternoon before: no refetch booked for 00:45 Casablanca.
      expect(matchRefetchInterval(unconfirmed, at("2026-09-26T15:00:00Z"))).toBe(false);
      // Where the watch would have been: 00:50, 01:30 and 03:30 in Casablanca.
      expect(matchRefetchInterval(unconfirmed, at("2026-09-26T23:50:00Z"))).toBe(false);
      expect(matchRefetchInterval(unconfirmed, at("2026-09-27T00:30:00Z"))).toBe(false);
      expect(matchRefetchInterval(unconfirmed, at("2026-09-27T02:30:00Z"))).toBe(false);
    });

    test("is followed as soon as the feed marks the match started", () => {
      expect(
        matchRefetchInterval({ ...unconfirmed, status: "live" }, at("2026-09-27T20:10:00Z")),
      ).toBe(30_000);
    });

    test("is only the exact hour: a minute off it is a real kick-off", () => {
      expect(
        matchRefetchInterval(
          { status: "scheduled", kickoff: "2026-09-27T00:01:00Z" },
          at("2026-09-26T23:50:00Z"),
        ),
      ).toBe(60_000);
    });
  });
});

describe("matchesRefetchInterval", () => {
  const now = Date.parse("2026-09-24T18:50:00Z");

  test("the shortest any match asks for", () => {
    expect(
      matchesRefetchInterval(
        [
          { status: "scheduled", kickoff: "2026-09-24T19:00:00Z" },
          { status: "live", kickoff: "2026-09-24T18:00:00Z" },
        ],
        now,
      ),
    ).toBe(30_000);
  });

  test("a match about to kick off keeps Home refreshing, so it becomes the live card", () => {
    expect(
      matchesRefetchInterval([{ status: "scheduled", kickoff: "2026-09-24T19:00:00Z" }], now),
    ).toBe(60_000);
  });

  test("the soonest kick-off books the refetch that starts its watch", () => {
    // 19:00 tomorrow: the watch opens at 18:45, 23 h 55 min from now.
    expect(
      matchesRefetchInterval(
        [
          { status: "scheduled", kickoff: "2026-09-26T19:00:00Z" },
          { status: "scheduled", kickoff: "2026-09-25T19:00:00Z" },
        ],
        now,
      ),
    ).toBe(minutes(23 * 60 + 55));
  });

  test("nothing live or within a day: no refresh", () => {
    expect(
      matchesRefetchInterval([{ status: "scheduled", kickoff: "2026-09-26T19:00:00Z" }], now),
    ).toBe(false);
    expect(matchesRefetchInterval([], now)).toBe(false);
    expect(matchesRefetchInterval(undefined, now)).toBe(false);
  });

  test("Home's next match at the placeholder hour keeps nothing polling at night", () => {
    // 00:50 in Casablanca, ten minutes before the placeholder.
    expect(
      matchesRefetchInterval(
        [
          { status: "scheduled", kickoff: "2026-09-25T00:00:00Z" },
          { status: "finished", kickoff: "2026-09-24T16:00:00Z" },
        ],
        Date.parse("2026-09-24T23:50:00Z"),
      ),
    ).toBe(false);
  });
});

/**
 * The Matches calendar's day list adds its own rules on top (a match just
 * finished, a stale "live"), but for a match to come it must agree with the
 * match page and Home about when to look: the same watch, the same wake-up,
 * the same silence for a placeholder hour.
 */
describe("the day list and the match page agree on a match to come", () => {
  test("every quarter of an hour from two days before kick-off to four hours after", () => {
    for (const kickoff of ["2026-09-26T20:00:00Z", "2026-09-27T00:00:00Z"]) {
      const match = { status: "scheduled" as const, kickoff };
      for (let offset = -48 * 60; offset <= 4 * 60; offset += 15) {
        const now = Date.parse(kickoff) + minutes(offset);
        expect([kickoff, offset, matchDayRefetchInterval([match], now)]).toEqual([
          kickoff,
          offset,
          matchRefetchInterval(match, now),
        ]);
      }
    }
  });
});

describe("liveStripRefetchInterval", () => {
  test("follows the score every 30 seconds while a match is live", () => {
    expect(liveStripRefetchInterval(2)).toBe(30_000);
  });

  test("keeps a slow watch with nothing live, so a match that starts brings the strip up", () => {
    expect(liveStripRefetchInterval(0)).toBe(LIVE_STRIP_IDLE_REFRESH_MS);
  });
});

/**
 * The match page's reads of its match land in a real query cache, under the
 * page's keys (`["football", "match-detail", id, language]`), next to the
 * season tables the "Face à face" tab reads. The page starts the watch with
 * the match's key without its language.
 */
describe("rereadTableOnFinish", () => {
  const MATCH = "match-1";
  const watched = ["football", "match-detail", MATCH];
  const detailKey = (language: "fr" | "ar", id = MATCH) => [
    "football",
    "match-detail",
    id,
    language,
  ];
  const tableKey = (season: string, language: "fr" | "ar") => [
    "football",
    "standings",
    season,
    language,
  ];
  const read = (status: Match["status"], id = MATCH) => ({
    match: { id, status },
    season: { id: "season-1", competitionId: "botola" },
  });

  const clients: QueryClient[] = [];
  const stops: (() => void)[] = [];
  afterEach(() => {
    for (const stop of stops.splice(0)) stop();
    for (const client of clients.splice(0)) client.clear();
  });

  /** A cache holding this season's table in both languages, and last season's. */
  function tables() {
    const client = new QueryClient();
    clients.push(client);
    for (const key of [
      tableKey("season-1", "fr"),
      tableKey("season-1", "ar"),
      tableKey("season-0", "fr"),
    ]) {
      client.setQueryData(key, { overall: [] });
    }
    return client;
  }
  function watch(client: QueryClient) {
    const stop = rereadTableOnFinish(client, watched);
    stops.push(stop);
    return stop;
  }
  /** Which of the three tables are marked to be read again. */
  const stale = (client: QueryClient) =>
    [tableKey("season-1", "fr"), tableKey("season-1", "ar"), tableKey("season-0", "fr")].map(
      (key) => client.getQueryState(key)?.isInvalidated ?? false,
    );

  test("the read that says the match is over marks every copy of its season's table stale", () => {
    const client = tables();
    client.setQueryData(detailKey("fr"), read("live"));
    watch(client);
    // Thirty seconds on, still in play: nothing to read again.
    client.setQueryData(detailKey("fr"), read("live"));
    expect(stale(client)).toEqual([false, false, false]);
    client.setQueryData(detailKey("fr"), read("finished"));
    // Both languages of this season's table; not last season's.
    expect(stale(client)).toEqual([true, true, false]);
  });

  test("a table on screen, the Face-à-face tab's, is read again at once", async () => {
    const client = tables();
    let tableReads = 0;
    const tab = new QueryObserver(client, {
      queryKey: tableKey("season-1", "fr"),
      queryFn: async () => {
        tableReads += 1;
        return { overall: [] };
      },
      staleTime: Infinity,
    });
    stops.push(tab.subscribe(() => {}));
    client.setQueryData(detailKey("fr"), read("live"));
    watch(client);
    expect(tableReads).toBe(0);
    client.setQueryData(detailKey("fr"), read("finished"));
    await Promise.resolve();
    expect(tableReads).toBe(1);
  });

  test("a page opened on a match already over has nothing to read again", () => {
    // Its first read, from the cache or from the network, says finished.
    const cached = tables();
    cached.setQueryData(detailKey("fr"), read("finished"));
    watch(cached);
    cached.setQueryData(detailKey("fr"), read("finished"));
    const cold = tables();
    watch(cold);
    cold.setQueryData(detailKey("fr"), read("finished"));
    expect([stale(cached), stale(cold)]).toEqual([
      [false, false, false],
      [false, false, false],
    ]);
  });

  test("a page opened before its first read still hears the whistle", () => {
    const client = tables();
    watch(client);
    client.setQueryData(detailKey("fr"), read("scheduled"));
    client.setQueryData(detailKey("fr"), read("live"));
    expect(stale(client)).toEqual([false, false, false]);
    client.setQueryData(detailKey("fr"), read("finished"));
    expect(stale(client)).toEqual([true, true, false]);
  });

  test("hears the whistle in the other language, after a switch", () => {
    const client = tables();
    client.setQueryData(detailKey("fr"), read("live"));
    watch(client);
    // The reader switched to Arabic; that copy's first read is after the whistle.
    client.setQueryData(detailKey("ar"), read("finished"));
    expect(stale(client)).toEqual([true, true, false]);
  });

  test("another match finishing is not this page's", () => {
    const client = tables();
    watch(client);
    client.setQueryData(detailKey("fr", "match-2"), read("live", "match-2"));
    client.setQueryData(detailKey("fr", "match-2"), read("finished", "match-2"));
    expect(stale(client)).toEqual([false, false, false]);
  });

  test("stops when the page lets go", () => {
    const client = tables();
    client.setQueryData(detailKey("fr"), read("live"));
    const stop = watch(client);
    stop();
    client.setQueryData(detailKey("fr"), read("finished"));
    expect(stale(client)).toEqual([false, false, false]);
  });
});
