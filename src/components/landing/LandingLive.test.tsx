import { describe, expect, it } from "bun:test";
import type { ReactElement } from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";

import { dictionaries } from "@/i18n/dictionaries";
import { I18nProvider } from "@/i18n/provider";
import type { FootballSeason } from "@/services/football";
import type { Club, Match } from "@/types/domain";
import type { FantasyPlayer } from "@/types/fantasy";
import { LandingBotolaNow, LandingPlayersToWatch } from "./LandingLive";

/**
 * The landing page's live football, rendered on a query cache seeded the way
 * the app's own reads fill it. The rule under test is the one the owner set:
 * nothing on the landing page is ever left blank. A block shows its skeleton
 * while it loads, its content once it has some, and is not drawn at all when
 * there is nothing to say.
 */

const fr = dictionaries.fr;

async function render(node: ReactElement, seed: (client: QueryClient) => void = () => {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  seed(client);
  const router = createRouter({
    routeTree: createRootRoute({ component: () => node }),
    history: createMemoryHistory({ initialEntries: ["/jouer"] }),
  });
  await router.load();
  return renderToString(
    <QueryClientProvider client={client}>
      <I18nProvider>
        <RouterProvider router={router} />
      </I18nProvider>
    </QueryClientProvider>,
  ).replace(/<!-- -->/g, "");
}

const club = (id: string, name: string, code: string): Club => ({
  id,
  slug: id,
  name: { fr: name, ar: name },
  shortName: { fr: code, ar: code },
  city: { fr: "", ar: "" },
  primaryColor: "var(--ui-ink)",
  crestPlaceholder: code,
});
const wydad = club("wac", "Wydad AC", "WAC");
const raja = club("rca", "Raja CA", "RCA");

const match: Match = {
  id: "m1",
  gameweek: 14,
  homeClubId: "wac",
  awayClubId: "rca",
  kickoff: "2026-10-05T19:00:00.000Z",
  status: "scheduled",
  venue: { fr: "", ar: "" },
};

const season = {
  id: "s1",
  competitionId: "c1",
  label: "2026/2027",
  startsOn: "2026-07-01",
  endsOn: "2027-06-30",
  status: "active",
  isCurrent: true,
} as unknown as FootballSeason;

const player = (id: string, name: string, totalPoints: number, ownership: number) =>
  ({
    id,
    name: { fr: name, ar: name },
    clubId: "wac",
    position: "FWD",
    price: 8,
    totalPoints,
    form: null,
    ownership,
    status: "available",
  }) as FantasyPlayer;

describe("LandingBotolaNow", () => {
  it("shows this round's matches and the top of the table once they are in", async () => {
    const html = await render(<LandingBotolaNow heading="h2" />, (client) => {
      client.setQueryData(["football", "home-matches", "fr"], {
        matches: [match],
        clubs: [wydad, raja],
        standings: [],
      });
      client.setQueryData(["football", "seasons", "fr"], [season]);
      client.setQueryData(["football", "standings", "s1", "fr"], {
        clubs: [wydad, raja],
        overall: [
          { clubId: "wac", position: 1, played: 13, points: 30 },
          { clubId: "rca", position: 2, played: 13, points: 25 },
        ],
        home: [],
        away: [],
        rounds: 13,
        computed: false,
      });
    });
    expect(html).toContain(fr["landing.now_title"]);
    expect(html).toContain('href="/matches/m1"');
    expect(html).toContain('href="/clubs/wac"');
    expect(html).toContain(">30<");
    expect(html).toContain('href="/matches/standings"');
  });

  // BG-0155: Home's payload now carries the whole round for the band's
  // carousel; this block keeps the three rows it showed when it held three.
  it("lists three matches at most, live first, however many the payload carries", async () => {
    const round: Match[] = [5, 1, 4, 2, 3].map((n) => ({
      ...match,
      id: `m${n}`,
      kickoff: `2026-10-0${n}T19:00:00.000Z`,
      status: n === 4 ? "live" : "scheduled",
    }));
    const html = await render(<LandingBotolaNow heading="h2" />, (client) => {
      client.setQueryData(["football", "home-matches", "fr"], {
        matches: round,
        clubs: [wydad, raja],
        standings: [],
      });
    });
    const rows = [...html.matchAll(/href="\/matches\/(m\d)"/g)].map((found) => found[1]);
    expect(rows).toEqual(["m4", "m1", "m2"]);
  });

  it("holds the blocks' places with skeletons while they load", async () => {
    const html = await render(<LandingBotolaNow heading="h2" />);
    expect(html).toContain(fr["landing.now_title"]);
    expect(html).toMatch(/shimmer|animate-pulse|skeleton/i);
  });

  it("is not drawn at all when there is no match and no table", async () => {
    const html = await render(<LandingBotolaNow heading="h2" />, (client) => {
      client.setQueryData(["football", "home-matches", "fr"], {
        matches: [],
        clubs: [],
        standings: [],
      });
      client.setQueryData(["football", "seasons", "fr"], [season]);
      client.setQueryData(["football", "standings", "s1", "fr"], {
        clubs: [],
        overall: [],
        home: [],
        away: [],
        rounds: 0,
        computed: true,
      });
    });
    expect(html).not.toContain('data-testid="landing-now"');
  });
});

describe("LandingPlayersToWatch", () => {
  it("ranks by Fantasy points once a gameweek has been scored", async () => {
    const html = await render(<LandingPlayersToWatch heading="h2" />, (client) => {
      client.setQueryData(
        ["fantasy-players"],
        [player("p1", "Second", 90, 50), player("p2", "First", 118, 10)],
      );
      client.setQueryData(["football", "clubs", "fr"], [wydad]);
    });
    expect(html).toContain(fr["landing.players_body_points"]);
    expect(html.indexOf("First")).toBeLessThan(html.indexOf("Second"));
    expect(html).toContain("118 pts");
    expect(html).toContain('href="/fantasy/players/p2"');
  });

  it("before any gameweek is scored, ranks by how many managers picked them", async () => {
    const html = await render(<LandingPlayersToWatch heading="h2" />, (client) => {
      client.setQueryData(
        ["fantasy-players"],
        [player("p1", "Less picked", 0, 12), player("p2", "Most picked", 0, 40)],
      );
      client.setQueryData(["football", "clubs", "fr"], [wydad]);
    });
    expect(html).toContain(fr["landing.players_body_owned"]);
    expect(html.indexOf("Most picked")).toBeLessThan(html.indexOf("Less picked"));
    expect(html).not.toContain("0 pts");
  });

  it("shows a player's approved photo, and the shirt silhouette without one", async () => {
    const html = await render(<LandingPlayersToWatch heading="h2" />, (client) => {
      client.setQueryData(
        ["fantasy-players"],
        [
          { ...player("p1", "With photo", 90, 50), photoUrl: "https://example.test/p1.webp" },
          player("p2", "Without photo", 80, 40),
        ],
      );
      client.setQueryData(["football", "clubs", "fr"], [wydad]);
    });
    expect(html).toContain('src="https://example.test/p1.webp"');
    expect(html.match(/<img\b/g)?.length ?? 0).toBe(1);
  });

  it("holds its place with skeletons until the visitor scrolls near it", async () => {
    let fetched = false;
    const html = await render(<LandingPlayersToWatch heading="h2" />, (client) => {
      client.getQueryCache().subscribe((event) => {
        if (event.type === "updated" && event.query.queryKey[0] === "fantasy-players") {
          fetched = true;
        }
      });
    });
    expect(html).toContain('data-testid="landing-players"');
    expect(html).toMatch(/shimmer|animate-pulse|skeleton/i);
    expect(fetched).toBe(false);
  });

  it("is not drawn at all without a player", async () => {
    const html = await render(<LandingPlayersToWatch heading="h2" />, (client) => {
      client.setQueryData(["fantasy-players"], []);
    });
    expect(html).not.toContain('data-testid="landing-players"');
  });
});

describe("the new copy exists in both languages", () => {
  it("has every key in French and Arabic", () => {
    for (const key of [
      "landing.now_kicker",
      "landing.now_title",
      "landing.now_matches",
      "landing.now_matches_link",
      "landing.now_table",
      "landing.now_table_link",
      "landing.players_title",
      "landing.players_body_points",
      "landing.players_body_owned",
      "landing.players_owned",
      "landing.players_link",
      "landing.faq_body",
      "landing.step2_example",
      "landing.team_note",
    ] as const) {
      expect(dictionaries.fr[key]).toBeTruthy();
      expect(dictionaries.ar[key]).toMatch(/[؀-ۿ]/);
    }
  });
});
