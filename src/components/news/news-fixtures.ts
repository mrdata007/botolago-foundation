import { useQuery } from "@tanstack/react-query";
import type { Match } from "@/types/domain";
import {
  defaultSeason,
  footballService,
  getFootballRepository,
  toMatch,
} from "@/services/football";

/**
 * Which fixture a News card is about.
 *
 * The news API sends an article's clubs (`teamIds`) and its publication time,
 * and nothing that names a fixture. So the link is read from the data we do
 * have, conservatively: an article that names exactly two clubs, and a fixture
 * of the current season those two clubs play, kicking off within a short
 * window of the article's publication. The nearest such fixture wins. When
 * nothing fits there is no link, and the card draws no score or time: a
 * thumbnail must never show a figure the data does not back.
 *
 * Pure and dependency-light so it can be unit-tested without a router.
 */

/** The fields of a fixture a card needs. */
export type NewsFixture = Pick<
  Match,
  | "id"
  | "homeClubId"
  | "awayClubId"
  | "kickoff"
  | "status"
  | "homeScore"
  | "awayScore"
  | "calledOff"
>;

/**
 * - `preview`  the article was published before kick-off: the card shows the
 *              kick-off time;
 * - `result`   published after a finished fixture with a final score: it shows
 *              the score;
 * - `match`    tied to the fixture, but with neither to show (a match in
 *              progress, or one finished without a score).
 */
export type ArticleFixtureKind = "preview" | "result" | "match";

export interface ArticleFixture {
  readonly kind: ArticleFixtureKind;
  readonly homeClubId: string;
  readonly awayClubId: string;
  readonly kickoff: string;
  readonly homeScore?: number;
  readonly awayScore?: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** A preview is published up to four days before kick-off... */
export const FIXTURE_LEAD_MS = 4 * DAY_MS;
/** ...and a report up to three days after it. */
export const FIXTURE_LAG_MS = 3 * DAY_MS;

/**
 * The fixture the article is about, or null. `clubIds` is the article's club
 * list as the API sends it; anything but exactly two distinct clubs is not a
 * fixture's pair, so a roundup that names three clubs links to nothing.
 */
export function linkArticleToFixture(
  article: { readonly clubIds: readonly string[]; readonly publishedAt: string },
  fixtures: readonly NewsFixture[] | undefined,
): ArticleFixture | null {
  if (!fixtures || fixtures.length === 0) return null;
  const clubs = [...new Set(article.clubIds)];
  if (clubs.length !== 2) return null;
  const published = Date.parse(article.publishedAt);
  if (!Number.isFinite(published)) return null;

  let best: { fixture: NewsFixture; distance: number } | null = null;
  for (const fixture of fixtures) {
    if (fixture.calledOff || fixture.status === "postponed") continue;
    if (!clubs.includes(fixture.homeClubId) || !clubs.includes(fixture.awayClubId)) continue;
    if (fixture.homeClubId === fixture.awayClubId) continue;
    const kickoff = Date.parse(fixture.kickoff);
    if (!Number.isFinite(kickoff)) continue;
    const ahead = kickoff - published;
    if (ahead > FIXTURE_LEAD_MS || ahead < -FIXTURE_LAG_MS) continue;
    const distance = Math.abs(ahead);
    if (!best || distance < best.distance) best = { fixture, distance };
  }
  if (!best) return null;

  const { fixture } = best;
  const base = {
    homeClubId: fixture.homeClubId,
    awayClubId: fixture.awayClubId,
    kickoff: fixture.kickoff,
  };
  if (Date.parse(fixture.kickoff) > published) return { ...base, kind: "preview" };
  if (
    fixture.status === "finished" &&
    typeof fixture.homeScore === "number" &&
    typeof fixture.awayScore === "number"
  ) {
    return { ...base, kind: "result", homeScore: fixture.homeScore, awayScore: fixture.awayScore };
  }
  return { ...base, kind: "match" };
}

/**
 * The current season's fixtures, once per session, shared by every News card
 * (one query key, so one read however many cards ask). A failed or empty read
 * is not an error for the page: the cards draw the club plate without a score
 * or time.
 */
export function useNewsFixtures(): readonly NewsFixture[] | undefined {
  const query = useQuery({
    queryKey: ["news", "fixture-index"],
    queryFn: async ({ signal }): Promise<NewsFixture[]> => {
      const season = defaultSeason(await footballService.getSeasons("fr", signal));
      if (!season) return [];
      const fixtures = await getFootballRepository().getSeasonFixtures(
        season.competitionId,
        season.id,
        "fr",
        { actorId: null, requestId: `news-fixtures-${Date.now().toString(36)}`, signal },
      );
      return fixtures.map((fixture) => {
        const match = toMatch(fixture);
        return {
          id: match.id,
          homeClubId: match.homeClubId,
          awayClubId: match.awayClubId,
          kickoff: match.kickoff,
          status: match.status,
          homeScore: match.homeScore,
          awayScore: match.awayScore,
          calledOff: match.calledOff,
        };
      });
    },
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });
  return query.data;
}
