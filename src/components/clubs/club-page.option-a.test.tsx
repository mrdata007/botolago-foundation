import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactElement } from "react";
import { renderToStaticMarkup, renderToString } from "react-dom/server";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";

import { dictionaries } from "@/i18n/dictionaries";
import { I18nProvider } from "@/i18n/provider";
import { clubSeasonStats, officialRecord } from "@/lib/club-season";
import type { LeagueTableRow } from "@/lib/league-table";
import type { Club, Match } from "@/types/domain";
import { StandingsTable } from "@/components/matches/StandingsTable";
import { ClubHero } from "./ClubHero";
import { ClubOverview } from "./ClubOverview";
import { ClubSquad } from "./ClubSquad";
import { ClubStats } from "./ClubStats";

/**
 * Option A — the club pages (A-Clubs, A-Club).
 *
 * The rules every screen owes the design system, checked on this lane's
 * files as source, and the page's decisions checked on rendered markup —
 * a memory router where a component holds a router `<Link>`, the French
 * dictionary, `react-dom/server` — as the match page's own test does.
 */

const ROOT = join(import.meta.dir, "..", "..", "..");
/** Source without comments, so a note that NAMES a forbidden construct does not trip a rule. */
const code = (path: string) =>
  readFileSync(join(ROOT, path), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

const FILES = [
  "src/routes/clubs.index.tsx",
  "src/routes/clubs.$clubId.tsx",
  "src/components/clubs/ClubHero.tsx",
  "src/components/clubs/ClubTabs.tsx",
  "src/components/clubs/ClubFollowButton.tsx",
  "src/components/clubs/ClubOverview.tsx",
  "src/components/clubs/ClubStats.tsx",
  "src/components/clubs/ClubMatchList.tsx",
  "src/components/clubs/ClubSquad.tsx",
  "src/components/clubs/stretched-link.ts",
  "src/components/matches/SeasonPicker.tsx",
];

describe("club pages — design-system rules in source", () => {
  for (const file of FILES) {
    const source = code(file);
    it(`${file}: logical properties only`, () => {
      expect(source).not.toMatch(
        /["'`\s](?:m[lr]|p[lr]|border-[lr]|rounded-[lr]|rounded-(?:tl|tr|bl|br)|text-(?:left|right)|float-(?:left|right))(?:-|\b)/,
      );
      expect(source).not.toMatch(/["'`\s]-?(?:left|right)-(?:\d|\[|1\/2|full|px)/);
      expect(source).not.toMatch(
        /\b(?:left|right|marginLeft|marginRight|paddingLeft|paddingRight):/,
      );
    });
    it(`${file}: every tracking is ltr:-only`, () => {
      expect(source).not.toMatch(/(?<!ltr:)tracking-/);
      expect(source).not.toMatch(/letter-?spacing/i);
    });
    it(`${file}: no literal colour and no --ui-ink as a foreground`, () => {
      expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(source).not.toMatch(/\brgba?\(/);
      expect(source).not.toMatch(/\b(?:bg|text)-(?:white|black)\b/);
      expect(source).not.toMatch(/(?:text|ring|border)-\[color:var\(--ui-ink\)\]/);
      expect(source).not.toMatch(/--brand-|--fpl-|--color-|--text-|--background-|--border-subtle/);
    });
    it(`${file}: no angled gradient, and never a <bdi> as a flex container`, () => {
      expect(source).not.toMatch(/gradient\([^)]*\d+deg/);
      expect(source).not.toMatch(/<bdi[^>]*className=[^>]*\bflex\b/);
    });
  }

  it("the club page reads News only while the flag is on, and never strands a cold reader", () => {
    const route = code("src/routes/clubs.$clubId.tsx");
    expect(route).toContain("enabled: NEWS_ENABLED && validId");
    expect(route).toContain('useBackTo("/clubs")');
    expect(route).not.toContain("history.back()");
    expect(code("src/components/clubs/ClubOverview.tsx")).toContain("{NEWS_ENABLED && (");
  });

  it("seeds the club query with the loader's payload, so the server and the first render agree", () => {
    const route = code("src/routes/clubs.$clubId.tsx");
    expect(route).toMatch(/return \{ club, fetchedAt \};/);
    expect(route).toMatch(/initialData: serverClub/);
    expect(route).toMatch(/initialDataUpdatedAt: serverClub \? loaderData\?\.fetchedAt/);
  });

  it("the tab labels are literal keys and fit a 390px column in Changa", () => {
    const tabs = code("src/components/clubs/ClubTabs.tsx");
    expect(tabs).toContain('label: t("club.tab.overview")');
    expect(tabs).toContain('label: t("club.tab.matches")');
    expect(tabs).toContain('label: t("club.tab.standings")');
    expect(tabs).toContain('label: t("club.tab.squad")');
    expect([
      dictionaries.fr["club.tab.overview"],
      dictionaries.fr["club.tab.matches"],
      dictionaries.fr["club.tab.standings"],
      dictionaries.fr["club.tab.squad"],
    ]).toEqual(["Aperçu", "Matchs", "Classement", "Effectif"]);
  });
});

// ---------------------------------------------------------------- markup

const inFrench = (node: ReactElement) => renderToStaticMarkup(<I18nProvider>{node}</I18nProvider>);

/** Copy as React writes it into markup: an apostrophe becomes `&#x27;`. */
const escapeHtml = (text: string) => text.replace(/'/g, "&#x27;");

async function withRouter(node: ReactElement): Promise<string> {
  const router = createRouter({
    routeTree: createRootRoute({ component: () => node }),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  return renderToString(
    <I18nProvider>
      <RouterProvider router={router} />
    </I18nProvider>,
  ).replace(/<!-- -->/g, "");
}

const club = (id: string, name: string, code: string): Club => ({
  id,
  name: { fr: name, ar: name },
  shortName: { fr: code, ar: code },
  city: { fr: "", ar: "" },
  primaryColor: "var(--ui-ink)",
  crestPlaceholder: code,
});
const WYDAD = club("00000010-0000-4000-8000-000000000001", "Wydad Casablanca", "WAC");
const RAJA = club("00000010-0000-4000-8000-000000000002", "Raja Casablanca", "RCA");
const FAR = club("00000010-0000-4000-8000-000000000003", "FAR Rabat", "FAR");
const clubs = new Map([WYDAD, RAJA, FAR].map((item) => [item.id, item]));
const clubById = (id: string) => clubs.get(id);

const tableRow = (item: Club, position: number, points: number, gd: number): LeagueTableRow => ({
  position,
  clubId: item.id,
  played: 30,
  won: 11,
  drawn: 10,
  lost: 9,
  goalDifference: gd,
  goalsFor: 39,
  goalsAgainst: 33,
  points,
  form: [],
});
const TABLE = [tableRow(FAR, 1, 59, 23), tableRow(RAJA, 2, 56, 20), tableRow(WYDAD, 3, 43, 6)];

const result = (
  id: string,
  day: number,
  home: Club,
  away: Club,
  hs: number,
  as: number,
): Match => ({
  id,
  gameweek: day,
  homeClubId: home.id,
  awayClubId: away.id,
  kickoff: new Date(Date.UTC(2026, 1, day, 18)).toISOString(),
  status: "finished",
  homeScore: hs,
  awayScore: as,
  venue: { fr: "", ar: "" },
});
const MATCHES = [
  result("m1", 1, WYDAD, RAJA, 3, 0),
  result("m2", 2, FAR, WYDAD, 2, 1),
  result("m3", 3, WYDAD, FAR, 1, 1),
];

describe("club page — the hero", () => {
  it("names the club in the page's h1 and says where it stands on a card of four figures", () => {
    const html = inFrench(
      <ClubHero club={WYDAD} headingId="h" kicker="Botola Pro Inwi · 2025/2026" row={TABLE[2]} />,
    );
    expect(html).toMatch(/<h1 id="h"[^>]*>Wydad Casablanca<\/h1>/);
    expect(html).toContain("Botola Pro Inwi · 2025/2026");
    // French ordinal on the figure; the label says what it is.
    expect(html).toMatch(/<bdi>3e<\/bdi>/);
    expect(html).toMatch(/<bdi>43<\/bdi>/);
    expect(html).toMatch(/<bdi>\+6<\/bdi>/);
    expect(html).toContain(dictionaries.fr["club.key.played"]);
  });

  it("draws no card of dashes before the club has a line in the table", () => {
    const html = inFrench(
      <ClubHero club={WYDAD} headingId="h" kicker="Botola Pro Inwi" row={undefined} />,
    );
    expect(html).not.toContain("<dl");
  });

  it("paints the band in the club's palette, with the stripes", () => {
    const html = inFrench(<ClubHero club={WYDAD} headingId="h" kicker="" row={undefined} />);
    expect(html).toMatch(/<section aria-labelledby="h" data-club="" style="[^"]*--club-fill-l/);
    expect(html).toContain("club-stripes");
  });
});

describe("club page — the figures", () => {
  const stats = clubSeasonStats(MATCHES, WYDAD.id);
  const record = officialRecord(undefined, stats.overall);

  it("counts the season from the fixtures when there is no table", async () => {
    const html = await withRouter(<ClubStats record={record} stats={stats} clubById={clubById} />);
    // 1 win, 1 draw, 1 defeat; 5 scored, 3 conceded over 3 matches.
    expect(record).toEqual({ played: 3, won: 1, drawn: 1, lost: 1, goalsFor: 5, goalsAgainst: 3 });
    expect(html).toContain("1,7 par match");
    expect(html).toContain("1,0 par match");
    expect(html).toContain(dictionaries.fr["club.stats.biggest_win"]);
    expect(html).toContain(dictionaries.fr["club.stats.heaviest_defeat"]);
    // Home and away as a real table, its row headers scoped.
    expect(html).toMatch(/<th scope="row"[^>]*>À domicile<\/th>/);
    expect(html).toMatch(/<th scope="row"[^>]*>À l&#x27;extérieur<\/th>/);
  });

  it("the overview offers the season before while this one has nothing played", async () => {
    const empty = clubSeasonStats([], WYDAD.id);
    const html = await withRouter(
      <ClubOverview
        club={WYDAD}
        matches={{ data: [], isPending: false, isError: false, refetch: () => undefined }}
        news={{ data: [], isPending: false, isError: false, refetch: () => undefined }}
        clubs={[WYDAD]}
        clubById={clubById}
        standings={[]}
        stats={empty}
        record={officialRecord(undefined, empty.overall)}
        seasonLabel="2026/2027"
        previousSeason={{ label: "2025/2026", onSelect: () => undefined }}
        standingsLink={{ to: "/", params: {}, search: {} }}
      />,
    );
    expect(html).toContain(escapeHtml(dictionaries.fr["club.season_empty"]));
    expect(html).toContain("Voir la saison 2025/2026");
    // No next match, no results, no table: those sections are left out.
    expect(html).not.toContain(dictionaries.fr["club.next_match"]);
    expect(html).not.toContain(dictionaries.fr["club.recent_results"]);
  });

  it("the overview marks the club in the table around it and links every other club", async () => {
    const html = await withRouter(
      <ClubOverview
        club={WYDAD}
        matches={{ data: MATCHES, isPending: false, isError: false, refetch: () => undefined }}
        news={{ data: [], isPending: false, isError: false, refetch: () => undefined }}
        clubs={[WYDAD, RAJA, FAR]}
        clubById={clubById}
        standings={TABLE}
        stats={stats}
        record={officialRecord(TABLE[2], stats.overall)}
        seasonLabel="2025/2026"
        previousSeason={undefined}
        standingsLink={{ to: "/", params: {}, search: {} }}
      />,
    );
    expect(html).toContain(dictionaries.fr["club.recent_results"]);
    expect(html).toMatch(/aria-current="true"[^>]*>/);
    expect(html).toContain(`href="/clubs/${RAJA.id}"`);
    expect(html).toContain(`href="/clubs/${FAR.id}"`);
    expect(html).not.toContain(`href="/clubs/${WYDAD.id}"`);
  });
});

describe("club page — the squad", () => {
  it("reads as a team sheet, with the number spoken and no invented one", () => {
    const html = inFrench(
      <ClubSquad
        club={WYDAD}
        squad={{
          data: [
            { id: "p1", name: "Forward One", position: "forward", shirtNumber: 9, role: "player" },
            { id: "p2", name: "Keeper", position: "goalkeeper", shirtNumber: 1, role: "captain" },
            { id: "p3", name: "No Number", position: "forward", shirtNumber: null, role: "player" },
          ],
          isPending: false,
          isError: false,
          refetch: () => undefined,
        }}
      />,
    );
    expect(html.indexOf("Gardiens")).toBeLessThan(html.indexOf("Attaquants"));
    expect(html).toContain("Numéro 9");
    expect(html).toContain(dictionaries.fr["club.squad.captain"]);
    expect(html).not.toContain("Numéro null");
  });
});

describe("the standings table", () => {
  it("links each club to its page and marks the page's own club as the current row", async () => {
    const html = await withRouter(
      <StandingsTable
        rows={TABLE}
        clubById={clubById}
        view="overall"
        caption="Classement"
        currentClubId={WYDAD.id}
      />,
    );
    for (const item of [WYDAD, RAJA, FAR]) expect(html).toContain(`href="/clubs/${item.id}"`);
    expect(html.match(/aria-current="true"/g)).toHaveLength(1);
    // The page's club, not the reader's: no "(Votre club)" for it.
    expect(html).not.toContain(dictionaries.fr["standings.your_club"]);
  });
});
