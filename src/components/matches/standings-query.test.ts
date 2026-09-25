import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { keepPreviousData, QueryClient, QueryObserver, type QueryKey } from "@tanstack/react-query";

import { isSameStandingsQuery } from "./standings-query";

/**
 * The Classement tab through a switch of language (review of audit
 * 2026-09-25): the table used to turn back into the skeleton on every switch,
 * though its ranks no longer depend on the language (audit A04). It now keeps
 * the same season's table up while the other language's loads, as the
 * calendar keeps its day (`isSameMatchDayQuery`), and never shows another
 * season's under the season just picked.
 */

const key = (seasonId: string | undefined, language: "fr" | "ar") =>
  ["football", "standings", seasonId, language] as const;

describe("the season table's query", () => {
  test("names the same season in either language, and nothing else", () => {
    expect(isSameStandingsQuery(key("s1", "fr"), key("s1", "ar"))).toBe(true);
    expect(isSameStandingsQuery(key("s1", "fr"), key("s1", "fr"))).toBe(true);
    expect(isSameStandingsQuery(key("s1", "fr"), key("s2", "ar"))).toBe(false);
    expect(isSameStandingsQuery(key("s1", "fr"), key("s2", "fr"))).toBe(false);
    expect(isSameStandingsQuery(key("s1", "fr"), ["football", "matches", "s1", "ar"])).toBe(false);
    expect(isSameStandingsQuery(key("s1", "fr"), ["football", "seasons", "ar"])).toBe(false);
  });

  // The page's two queries, on query observers as `useQuery` drives them.
  test("keeps the season and its table up through a language switch, never another season's", () => {
    type Seasons = readonly { readonly id: string }[];
    type Table = { readonly rounds: number; readonly computed: boolean };
    const client = new QueryClient();
    const never = () => new Promise<never>(() => {});
    const seasons = (language: "fr" | "ar") => ({
      queryKey: ["football", "seasons", language] as QueryKey,
      queryFn: never,
      placeholderData: keepPreviousData<Seasons>,
    });
    const table = (seasonId: string, language: "fr" | "ar") => ({
      queryKey: key(seasonId, language) as QueryKey,
      queryFn: never,
      placeholderData: (previous: Table | undefined, previousQuery?: { queryKey: QueryKey }) =>
        previousQuery && isSameStandingsQuery(previousQuery.queryKey, key(seasonId, language))
          ? previous
          : undefined,
    });
    const frenchSeasons: Seasons = [{ id: "s1" }, { id: "s2" }];
    const frenchTable: Table = { rounds: 3, computed: true };
    client.setQueryData(["football", "seasons", "fr"], frenchSeasons);
    client.setQueryData(key("s1", "fr"), frenchTable);

    const seasonsObserver = new QueryObserver<Seasons, Error, Seasons, Seasons, QueryKey>(
      client,
      seasons("fr"),
    );
    const tableObserver = new QueryObserver<Table, Error, Table, Table, QueryKey>(
      client,
      table("s1", "fr"),
    );
    const stop = [seasonsObserver.subscribe(() => {}), tableObserver.subscribe(() => {})];
    try {
      seasonsObserver.setOptions(seasons("ar"));
      tableObserver.setOptions(table("s1", "ar"));
      expect(seasonsObserver.getCurrentResult()).toMatchObject({
        data: frenchSeasons,
        isPlaceholderData: true,
        isPending: false,
      });
      expect(tableObserver.getCurrentResult()).toMatchObject({
        data: frenchTable,
        isPlaceholderData: true,
        isPending: false,
      });
      // The reader picks another season: its own table, or the skeleton.
      tableObserver.setOptions(table("s2", "ar"));
      expect(tableObserver.getCurrentResult()).toMatchObject({ data: undefined, isPending: true });
    } finally {
      for (const unsubscribe of stop) unsubscribe();
      client.clear();
    }
  });

  test("is how the Classement tab keeps its seasons and its table", () => {
    const page = readFileSync(
      join(import.meta.dir, "..", "..", "routes", "matches.standings.tsx"),
      "utf8",
    );
    const seasons = page.slice(page.indexOf("const seasonsQ = useQuery({"));
    expect(seasons.slice(0, seasons.indexOf("});"))).toContain("placeholderData: keepPreviousData");
    const table = page.slice(page.indexOf("const standingsQ = useQuery({"));
    expect(table.slice(0, table.indexOf("});"))).toMatch(
      /placeholderData: \(previous, previousQuery\) =>\s*previousQuery &&\s*isSameStandingsQuery\(previousQuery\.queryKey, \["football", "standings", season\?\.id, lang\]\)\s*\? previous\s*: undefined/,
    );
  });
});
