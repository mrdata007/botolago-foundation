import { describe, expect, test } from "bun:test";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterContextProvider,
} from "@tanstack/react-router";

import { I18nProvider } from "@/i18n/provider";
import {
  BOTOLA_2025_26_FINAL_TABLE,
  BOTOLA_2025_26_RESULTS,
} from "@/lib/__fixtures__/botola-2025-26";
import { clubStanding, computeLeagueTable, type TableResult } from "@/lib/league-table";
import type { Club } from "@/types/domain";
import { StandingsLegend, StandingsTable } from "./StandingsTable";
import { YourClubCard } from "./YourClubCard";

/**
 * The Classement table and the "Votre club" card, rendered on the real
 * 2025/26 season: its 240 results worked out into the final table.
 */
// Each club name in the table is a router link to its club page.
const router = createRouter({
  routeTree: createRootRoute(),
  history: createMemoryHistory({ initialEntries: ["/"] }),
});
const inFrench = (node: ReactElement) =>
  renderToStaticMarkup(
    <RouterContextProvider router={router}>
      <I18nProvider>{node}</I18nProvider>
    </RouterContextProvider>,
  ).replace(/<!-- -->/g, "");

const results: TableResult[] = BOTOLA_2025_26_RESULTS.map(([home, away, hs, as, kickoff]) => ({
  homeClubId: home,
  awayClubId: away,
  homeScore: hs,
  awayScore: as,
  kickoff,
}));
const slugs = BOTOLA_2025_26_FINAL_TABLE.map(([club]) => club);
const overall = computeLeagueTable(slugs, results, "overall");
const home = computeLeagueTable(slugs, results, "home");

/** A club as the football service presents it; Wydad's short name is its code in production. */
const club = (slug: string): Club => {
  const wydad = slug === "wydad-casablanca";
  const name = wydad ? "Wydad Casablanca" : slug;
  return {
    id: slug,
    slug,
    name: { fr: name, ar: name },
    shortName: { fr: wydad ? "WCA" : slug, ar: wydad ? "WCA" : slug },
    city: { fr: "", ar: "" },
    primaryColor: "var(--ui-ink)",
    crestPlaceholder: wydad ? "WCA" : slug.slice(0, 3).toUpperCase(),
  };
};
const clubById = (id: string) => (slugs.includes(id) ? club(id) : undefined);

const bodyRows = (html: string) => html.split("<tbody")[1]!.split("<tr").slice(1);

describe("StandingsTable", () => {
  const html = inFrench(
    <StandingsTable rows={overall} clubById={clubById} view="overall" caption="Classement" />,
  );

  test("draws every club, best first, with every figure", () => {
    const rows = bodyRows(html);
    expect(rows).toHaveLength(16);
    expect(rows[0]).toContain("maghreb-f-s");
    expect(rows[0]).toContain(">+23<");
    expect(rows[0]).toContain(">59<");
    for (const heading of ["Matches joués", "Gagnés", "Nuls", "Perdus", "Différence de buts"]) {
      expect(html).toContain(`<span class="sr-only">${heading}</span>`);
    }
  });

  test("marks the African places and the drop, and names each for assistive tech", () => {
    const rows = bodyRows(html);
    const zoneOf = (row: string) => row.match(/<span class="sr-only">, ([^<]+)<\/span>/)?.[1];
    expect(rows.map(zoneOf)).toEqual([
      "Ligue des champions CAF",
      "Ligue des champions CAF",
      "Coupe de la Confédération CAF",
      ...Array.from({ length: 11 }, () => undefined),
      "Relégation",
      "Relégation",
    ]);
    expect(rows[0]).toContain("bg-[color:var(--ui-ink-fg)]");
    expect(rows[2]).toContain("bg-[color:var(--ui-positive)]");
    expect(rows[15]).toContain("bg-[color:var(--ui-negative)]");
  });

  test("prints a club's name, not its code twice", () => {
    expect(html).toContain("Wydad Casablanca");
  });

  test("a home table qualifies for nothing, so it has no zone bars", () => {
    const homeHtml = inFrench(
      <StandingsTable rows={home} clubById={clubById} view="home" caption="Classement" />,
    );
    expect(homeHtml).not.toContain("Ligue des champions CAF");
    expect(homeHtml).not.toContain("--ui-negative");
    expect(bodyRows(homeHtml)[0]).toContain("far-rabat");
  });

  test("the form view swaps the figures for the last five results", () => {
    const formHtml = inFrench(
      <StandingsTable rows={overall} clubById={clubById} view="form" caption="Classement" />,
    );
    expect(formHtml).toContain(">Forme<");
    expect(formHtml).not.toContain("Gagnés");
    // Wydad lost its last five: five "Défaite" chips on its row.
    const wydad = bodyRows(formHtml).find((row) => row.includes("Wydad Casablanca"))!;
    expect(wydad.match(/aria-label="Défaite"/g)).toHaveLength(5);
  });

  test("tints the reader's club and says so", () => {
    const mine = inFrench(
      <StandingsTable
        rows={overall}
        clubById={clubById}
        view="overall"
        caption="Classement"
        highlightClubId="raja-casablanca"
      />,
    );
    // The row's own opening tag carries the club colours (every crest does too).
    const tinted = bodyRows(mine).filter((row) => row.split(">")[0]!.includes("data-club"));
    expect(tinted).toHaveLength(1);
    expect(tinted[0]).toContain("raja-casablanca");
    expect(tinted[0]).toContain("bg-[color:var(--ui-club-tint)]");
    expect(tinted[0]).toContain("(Votre club)");
  });

  test("opens each club's page from its name", () => {
    for (const slug of slugs) expect(html).toContain(`href="/clubs/${slug}"`);
  });

  test("on a club page, marks that club's row as the current one, not as the reader's", () => {
    const page = inFrench(
      <StandingsTable
        rows={overall}
        clubById={clubById}
        view="overall"
        caption="Classement"
        currentClubId="raja-casablanca"
      />,
    );
    const tinted = bodyRows(page).filter((row) => row.split(">")[0]!.includes("data-club"));
    expect(tinted).toHaveLength(1);
    expect(tinted[0]!.split(">")[0]).toContain('aria-current="true"');
    expect(tinted[0]).toContain("raja-casablanca");
    expect(page).not.toContain("(Votre club)");
  });

  test("the legend keys the three zones", () => {
    const legend = inFrench(<StandingsLegend />);
    expect(legend.match(/<li/g)).toHaveLength(3);
    expect(legend).toContain("Coupe de la Confédération CAF");
  });
});

describe("YourClubCard", () => {
  const card = (slug: string) =>
    inFrench(<YourClubCard club={club(slug)} standing={clubStanding(overall, slug)!} />);

  test("gives the rank, the zone, the form and the gap to the place above", () => {
    const raja = card("raja-casablanca");
    expect(raja).toContain("Votre club");
    expect(raja).toContain("Coupe de la Confédération CAF");
    expect(raja).toContain('<span class="sr-only">3e</span>');
    expect(raja).toContain("56 pts · à 1 point de la 2e place");
    expect(raja.match(/role="img"/g)).toHaveLength(5);
  });

  test("gives the leader its lead", () => {
    expect(card("maghreb-f-s")).toContain("59 pts · 2 points d&#x27;avance sur la 2e place");
  });

  test("says level on points, and names no zone for mid-table", () => {
    const codm = card("codm-mekn-s");
    expect(codm).toContain("36 pts · à égalité de points avec la 9e place");
    expect(codm).not.toContain("CAF");
    expect(codm).not.toContain("Relégation");
  });
});
