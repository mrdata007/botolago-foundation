import { describe, expect, test } from "bun:test";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterContextProvider,
} from "@tanstack/react-router";

import { dictionaries } from "@/i18n/dictionaries";
import { I18nProvider } from "@/i18n/provider";
import {
  BOTOLA_2025_26_FINAL_TABLE,
  BOTOLA_2025_26_RESULTS,
} from "@/lib/__fixtures__/botola-2025-26";
import { clubMatchPalettes } from "@/lib/club-palette";
import { clubStanding, computeLeagueTable, type TableResult } from "@/lib/league-table";
import type { Club } from "@/types/domain";
import { HeadToHead } from "./HeadToHead";
import { StandingsLegend, StandingsNotes, StandingsTable } from "./StandingsTable";
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
    expect(codm).not.toContain("Ex æquo");
  });
});

/**
 * The first day of a season (audit A04): one result, and fourteen clubs yet
 * to play, level on every figure, sharing 2nd — a tie that spans the African
 * places and the drop.
 */
describe("a table with clubs level on every figure", () => {
  const [winner, loser, ...idle] = slugs;
  const firstDay = computeLeagueTable(
    slugs,
    [
      {
        homeClubId: loser!,
        awayClubId: winner!,
        homeScore: 1,
        awayScore: 3,
        kickoff: "2026-09-24T20:00:00Z",
      },
    ],
    "overall",
  );
  const html = inFrench(
    <StandingsTable rows={firstDay} clubById={clubById} view="overall" caption="Classement" />,
  );
  const rows = bodyRows(html);
  const rankCell = (row: string) => row.split("</td>")[0]!;

  test("prints the shared rank on every club of the tie and says so for assistive tech", () => {
    expect(rows).toHaveLength(16);
    expect(rankCell(rows[0]!)).toContain(">1<");
    for (const row of rows.slice(1, 15)) {
      expect(rankCell(row)).toMatch(/>2<span class="sr-only">, Ex æquo<\/span>/);
    }
    expect(rankCell(rows[15]!)).toContain(">16<");
    expect(rankCell(rows[0]!)).not.toContain("Ex æquo");
  });

  test("gives none of the tied clubs an African place or the drop", () => {
    expect(rankCell(rows[0]!)).toContain("Ligue des champions CAF");
    expect(rankCell(rows[15]!)).toContain("Relégation");
    for (const row of rows.slice(1, 15)) {
      expect(rankCell(row)).not.toContain('class="absolute inset-y-0 start-0 w-1');
      expect(rankCell(row)).not.toMatch(/CAF|Relégation/);
    }
  });

  test("the notes say the table is provisional and that a shared rank decides nothing", () => {
    const notes = inFrench(<StandingsNotes rows={firstDay} computed seasonStatus="active" />);
    expect(notes).toContain("Classement provisoire, calculé à partir des résultats des matchs.");
    expect(notes).toContain("Un même rang signale des clubs à égalité");
    // The provider's final table, one club a position: nothing to say.
    expect(
      inFrench(<StandingsNotes rows={overall} computed={false} seasonStatus="completed" />),
    ).toBe("");
  });

  test("a table worked out from a finished season's results is unofficial, not provisional", () => {
    const notes = inFrench(<StandingsNotes rows={overall} computed seasonStatus="completed" />);
    expect(notes).toContain("Classement non officiel, calculé à partir des résultats des matchs.");
    expect(notes).not.toContain("provisoire");
  });

  test("a snapshot names the tie it shows, and only a tie it shows", () => {
    // Home's top five: 1st and four of the fourteen clubs sharing 2nd.
    const top = inFrench(
      <StandingsNotes
        rows={firstDay}
        shown={firstDay.slice(0, 5)}
        computed={false}
        seasonStatus="active"
      />,
    );
    expect(top).toContain("Un même rang signale des clubs à égalité");
    // The leader alone: no tie on screen, however many there are below.
    const leader = inFrench(
      <StandingsNotes
        rows={firstDay}
        shown={firstDay.slice(0, 1)}
        computed={false}
        seasonStatus="active"
      />,
    );
    expect(leader).toBe("");
  });

  test("every note has its Arabic", () => {
    for (const key of [
      "standings.provisional",
      "standings.unofficial",
      "standings.shared_rank",
      "standings.shared_rank_note",
    ] as const) {
      expect([key, /[؀-ۿ]/.test(dictionaries.ar[key])]).toEqual([key, true]);
    }
    expect(dictionaries.ar["standings.unofficial"]).toBe(
      "ترتيب غير رسمي، محسوب من نتائج المباريات.",
    );
  });

  test("the Face-à-face table says a shared rank for assistive tech, read from the whole table", () => {
    // Two of the clubs sharing 2nd: level with each other and with twelve more.
    const [first, second] = idle as [string, string];
    const html = inFrench(
      <HeadToHead
        home={club(first)}
        away={club(second)}
        palettes={clubMatchPalettes(club(first), club(second))}
        standings={firstDay}
        meetings={[]}
      />,
    );
    const cells = html.split("<tbody")[1]!.split("<tr").slice(1);
    expect(cells).toHaveLength(2);
    for (const row of cells) expect(row).toMatch(/>2<span class="sr-only">, Ex æquo<\/span>/);
    // The leader, alone on 1st, is not.
    const leader = inFrench(
      <HeadToHead
        home={club(winner!)}
        away={club(first)}
        palettes={clubMatchPalettes(club(winner!), club(first))}
        standings={firstDay}
        meetings={[]}
      />,
    );
    expect(leader.split("<tbody")[1]!.split("<tr")[1]).not.toContain("Ex æquo");
  });

  test("the club card says a shared rank, and measures it against 1st", () => {
    const club0 = idle[0]!;
    const shared = inFrench(
      <YourClubCard club={club(club0)} standing={clubStanding(firstDay, club0)!} />,
    );
    expect(shared).toContain("Ex æquo");
    expect(shared).toContain('<span class="sr-only">2e</span>');
    // "0 pts": French files 0 under the plural "one", whose phrase is "1 pt".
    expect(shared).toContain("0 pts · à 3 points de la 1re place");
    expect(shared).not.toMatch(/CAF|Relégation/);
  });
});
