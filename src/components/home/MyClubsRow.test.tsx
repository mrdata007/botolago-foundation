import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactElement } from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";

import { I18nProvider } from "@/i18n/provider";
import type { FootballSeason } from "@/services/football";
import type { Club, Match, TableRow } from "@/types/domain";
import { MyClubsRow } from "./MyClubsRow";
import { homeClubs } from "./my-clubs";

/**
 * Home's "Mes clubs" row, rendered for real: a memory router, the French
 * dictionary, and the club page's own query keys seeded the way that page
 * seeds them, through `react-dom/server`.
 */

const ROOT = join(import.meta.dir, "..", "..", "..");

function club(id: string, name: string, code: string): Club {
  return {
    id,
    name: { fr: name, ar: name },
    shortName: { fr: code, ar: code },
    city: { fr: "", ar: "" },
    primaryColor: "var(--ui-ink)",
    crestPlaceholder: code,
  };
}

const WYDAD = club("wydad", "Wydad AC", "WAC");
const RAJA = club("raja", "Raja CA", "RCA");
const FAR = club("far", "AS FAR", "FAR");
const OTHER = club("other", "Hassania Agadir", "HUSA");

const SEASON: FootballSeason = {
  id: "season-1",
  competitionId: "botola",
  label: "2026/2027",
  startsOn: "2026-09-01",
  endsOn: "2027-06-30",
  status: "in_progress",
  isCurrent: true,
  firstMatchDate: "2026-09-19",
  lastMatchDate: null,
  competitionName: "Botola Pro",
} as unknown as FootballSeason;

function fixture(overrides: Partial<Match>): Match {
  return {
    id: "m1",
    gameweek: 3,
    homeClubId: WYDAD.id,
    awayClubId: OTHER.id,
    kickoff: "2026-10-10T19:30:00Z",
    status: "scheduled",
    venue: { fr: "", ar: "" },
    ...overrides,
  };
}

function row(clubId: string, position: number, points: number): TableRow {
  return {
    position,
    clubId,
    played: 2,
    won: 1,
    drawn: 0,
    lost: 1,
    goalDifference: 0,
    points,
    form: [],
  };
}

type Seed = Record<string, readonly Match[]>;

async function render(
  tiles: ReturnType<typeof homeClubs<Club>>,
  seed: Seed,
  standings: readonly TableRow[] = [],
): Promise<string> {
  const queryClient = new QueryClient();
  for (const [clubId, matches] of Object.entries(seed)) {
    queryClient.setQueryData(["football", "club-matches", clubId, SEASON.id, "fr"], {
      matches,
      clubs: [WYDAD, RAJA, FAR, OTHER],
    });
  }
  const node: ReactElement = (
    <MyClubsRow
      tiles={tiles}
      season={SEASON}
      seasonReady
      standings={standings}
      clubById={(id) => [WYDAD, RAJA, FAR, OTHER].find((c) => c.id === id)}
    />
  );
  const router = createRouter({
    routeTree: createRootRoute({ component: () => node }),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  return renderToString(
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <RouterProvider router={router} />
      </I18nProvider>
    </QueryClientProvider>,
  ).replace(/<!-- -->/g, "");
}

describe("MyClubsRow", () => {
  it("draws nothing for a reader with no club", async () => {
    expect(await render([], {})).not.toContain("home-my-clubs");
  });

  it("puts the favourite first, badged once, and the followed club after it", async () => {
    const html = await render(homeClubs(WYDAD, [RAJA]), {
      [WYDAD.id]: [fixture({})],
      [RAJA.id]: [fixture({ id: "m2", homeClubId: RAJA.id })],
    });
    expect(html.indexOf("home-my-club-wydad")).toBeGreaterThan(-1);
    expect(html.indexOf("home-my-club-wydad")).toBeLessThan(html.indexOf("home-my-club-raja"));
    expect(html.split("Favori").length - 1).toBe(1);
    expect(html).toContain("Mes clubs");
  });

  it("each card's name opens the club, and its match opens the match", async () => {
    const html = await render(homeClubs(WYDAD, []), { [WYDAD.id]: [fixture({})] });
    expect(html).toContain('href="/clubs/wydad"');
    expect(html).toContain('href="/matches/m1"');
  });

  it("labels the next match, and says where the club stands", async () => {
    const html = await render(homeClubs(WYDAD, []), { [WYDAD.id]: [fixture({})] }, [
      row("far", 1, 6),
      row("raja", 2, 4),
      row(WYDAD.id, 3, 3),
    ]);
    expect(html).toContain("Prochain match");
    expect(html).toContain("3e");
    expect(html).not.toContain("Ex æquo");
  });

  it("says when the club's place is shared with clubs level on every figure", async () => {
    const html = await render(homeClubs(WYDAD, []), { [WYDAD.id]: [fixture({})] }, [
      row("far", 2, 3),
      row(WYDAD.id, 2, 3),
    ]);
    expect(html).toContain("Ex æquo");
  });

  it("shows a postponed fixture as the match card words it, Reporté, under the next-match label", async () => {
    const html = await render(homeClubs(WYDAD, []), {
      [WYDAD.id]: [fixture({ status: "postponed", dateUnconfirmed: true })],
    });
    expect(html).toContain("Prochain match");
    expect(html).toContain("Reporté");
    expect(html).not.toContain("Dernier résultat");
  });

  it("falls back to the last result, named as one, when nothing is left to play", async () => {
    const html = await render(homeClubs(WYDAD, []), {
      [WYDAD.id]: [fixture({ status: "finished", homeScore: 2, awayScore: 1 })],
    });
    expect(html).toContain("Dernier résultat");
    expect(html).not.toContain("Prochain match");
  });

  it("says the season has not started for a club with no fixture and no result", async () => {
    const html = await render(homeClubs(WYDAD, []), { [WYDAD.id]: [] });
    expect(html.replace(/&#x27;/g, "'")).toContain("Aucun match joué cette saison pour l'instant.");
  });

  it("holds a card's place with a skeleton while its matches load, and asks for nothing before the seasons", async () => {
    const html = await render(homeClubs(WYDAD, [RAJA]), { [WYDAD.id]: [fixture({})] });
    // Raja has no data seeded: its card is there, with no match yet.
    expect(html).toContain("home-my-club-raja");
    expect(html).not.toContain('href="/matches/m2"');
  });

  it("is one card wide for one club and a swipeable row for several", async () => {
    const one = await render(homeClubs(WYDAD, []), { [WYDAD.id]: [fixture({})] });
    const many = await render(homeClubs(WYDAD, [RAJA]), {
      [WYDAD.id]: [fixture({})],
      [RAJA.id]: [fixture({ id: "m2" })],
    });
    expect(one).toContain("basis-full");
    expect(one).not.toContain("basis-[88%]");
    expect(many).toContain("snap-x");
    expect(many).toContain("basis-[88%]");
  });
});

describe("MyClubsRow — source", () => {
  const source = readFileSync(join(ROOT, "src/components/home/MyClubsRow.tsx"), "utf8");
  const clubPage = readFileSync(join(ROOT, "src/routes/clubs.$clubId.tsx"), "utf8");

  it("asks for a club's matches under the club page's own key, so opening a club finds them cached", () => {
    const key = '["football", "club-matches", club.id, season?.id ?? "none", lang]';
    expect(source).toContain(key);
    expect(clubPage).toContain('["football", "club-matches", clubId, season?.id ?? "none", lang]');
  });

  it("uses no physical direction, so Arabic mirrors by itself", () => {
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
    expect(code).not.toMatch(
      /["'`\s](?:m[lr]|p[lr]|border-[lr]|rounded-[lr]|rounded-(?:tl|tr|bl|br)|text-(?:left|right)|float-(?:left|right))(?:-|\b)/,
    );
  });
});

describe("Home — where the row sits", () => {
  const home = readFileSync(join(ROOT, "src/routes/index.tsx"), "utf8");

  it("is inside the upcoming-matches section, right under its heading", () => {
    const section = home.indexOf('<Section className="order-3 lg:mt-0">');
    const heading = home.indexOf('title={t("matches.section.upcoming")}', section);
    const row = home.indexOf("<MyClubsRow", section);
    expect(section).toBeGreaterThan(-1);
    expect(row).toBeGreaterThan(heading);
    // Nothing but the heading's own closing between them.
    expect(home.slice(heading, row)).not.toContain("<Section");
  });

  it("keeps the section for a reader with clubs even when nothing else is upcoming", () => {
    expect(home).toContain("myClubs.length > 0) && (");
  });

  it("reads the favourite club by id or slug, as Profile does", () => {
    expect(home).toContain("findClub(clubsQ.data, user?.favoriteClubId)");
  });
});
