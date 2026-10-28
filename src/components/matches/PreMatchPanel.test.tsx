import { describe, expect, it } from "bun:test";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { renderToString } from "react-dom/server";

import { dictionaries } from "@/i18n/dictionaries";
import { I18nProvider } from "@/i18n/provider";
import { clubMatchPalettes } from "@/lib/club-palette";
import type { Club, Match, TableRow } from "@/types/domain";
import { PreMatchPanel } from "./PreMatchPanel";
import { lastMeeting, standingOf } from "./pre-match";

/**
 * "Avant-match", the Résumé of a match still to be played: the kick-off in
 * Morocco's time, each club's place and form, the last meeting. Every value
 * comes from what the page holds, a value it does not have is a dash, and a row
 * with nothing true to say is not drawn.
 */

const fr = dictionaries.fr;

const club = (id: string, name: string, short: string): Club => ({
  id,
  slug: id,
  name: { fr: name, ar: name },
  shortName: { fr: short, ar: short },
  city: { fr: "", ar: "" },
  primaryColor: "var(--ui-ink)",
  crestPlaceholder: short,
});
const raja = club("raja", "Raja Casablanca", "Raja");
const hassania = club("hassania", "Hassania Agadir", "HUSA");
const palettes = clubMatchPalettes(raja, hassania);

const fixture: Match = {
  id: "next",
  gameweek: 5,
  homeClubId: "raja",
  awayClubId: "hassania",
  kickoff: "2099-10-28T18:00:00.000Z",
  status: "scheduled",
  venue: { fr: "", ar: "" },
};
const played = (over: Partial<Match>): Match => ({
  ...fixture,
  id: "old",
  kickoff: "2026-03-01T18:00:00.000Z",
  status: "finished",
  homeScore: 2,
  awayScore: 1,
  ...over,
});
const row = (
  clubId: string,
  position: number,
  points: number,
  form: TableRow["form"],
): TableRow => ({
  position,
  clubId,
  played: 4,
  won: 1,
  drawn: 1,
  lost: 2,
  goalDifference: 0,
  points,
  form,
});

async function render(
  props: Partial<Parameters<typeof PreMatchPanel>[0]> = {},
  match: Match = fixture,
): Promise<string> {
  const node = (
    <I18nProvider>
      <PreMatchPanel
        match={match}
        home={raja}
        away={hassania}
        palettes={palettes}
        meetings={[]}
        {...props}
      />
    </I18nProvider>
  );
  const root = createRootRoute({ component: () => node });
  const router = createRouter({
    routeTree: root.addChildren([
      createRoute({ getParentRoute: () => root, path: "/matches/$matchId", component: () => null }),
    ]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  return renderToString(<RouterProvider router={router} />).replace(/<!-- -->/g, "");
}

describe("lastMeeting", () => {
  it("is the most recent finished meeting with a score, never this fixture", () => {
    const older = played({ id: "a", kickoff: "2025-11-01T18:00:00.000Z" });
    const newer = played({ id: "b", kickoff: "2026-03-01T18:00:00.000Z" });
    expect(lastMeeting([older, newer], "next")?.id).toBe("b");
    expect(
      lastMeeting([older, newer, { ...fixture, kickoff: "2099-01-01T00:00:00Z" }], "next")?.id,
    ).toBe("b");
    expect(lastMeeting([older, newer], "b")?.id).toBe("a");
  });

  it("skips a meeting that was not played or has no score, and answers null for none", () => {
    expect(lastMeeting([played({ id: "x", status: "scheduled" })], "next")).toBeNull();
    expect(lastMeeting([played({ id: "x", homeScore: undefined })], "next")).toBeNull();
    expect(lastMeeting([played({ id: "x", awayScore: undefined })], "next")).toBeNull();
    expect(lastMeeting([], "next")).toBeNull();
  });
});

describe("standingOf", () => {
  it("finds the club's row, and is undefined without a table or a row", () => {
    const rows = [row("raja", 2, 9, [])];
    expect(standingOf(rows, "raja")?.position).toBe(2);
    expect(standingOf(rows, "hassania")).toBeUndefined();
    expect(standingOf(undefined, "raja")).toBeUndefined();
  });
});

/** What a club's colour block says: its big position figure and its points. */
function tile(html: string, short: string): { position: string; points: string } {
  const block = html.split("<li ").find((part) => part.includes(`>${short}</p>`)) ?? "";
  return {
    position: /score-lg\)\][^>]*>([^<]*)<\/bdi>/.exec(block)?.[1] ?? "missing",
    points: /fpl-tabular">([^<]*)<\/bdi>/.exec(block)?.[1] ?? "missing",
  };
}

describe("PreMatchPanel", () => {
  it("shows the kick-off in Morocco's time, each club's place, points and form, and the last meeting", async () => {
    const html = await render({
      standings: [row("raja", 3, 9, ["W", "W", "D", "L", "W"]), row("hassania", 11, 4, ["L", "D"])],
      meetings: [played({ id: "old" })],
    });
    expect(html).toContain(fr["matches.pre.title"]);
    expect(html).toContain("Coup d&#x27;envoi à 18:00 (heure du Maroc)");
    // Position and points, per club, in the club's own colour block.
    expect(tile(html, "Raja")).toEqual({ position: "3", points: "9" });
    expect(tile(html, "HUSA")).toEqual({ position: "11", points: "4" });
    expect(html.match(/bg-\[color:var\(--ui-club\)\]/g)).toHaveLength(2);
    // The countdown sits on the navy band (empty until the browser's clock is read).
    expect(html).toContain("bg-[color:var(--ui-ink)]");
    // Form chips: five for Raja, two for Hassania.
    expect(html.match(/role="img"/g)).toHaveLength(7);
    // The last meeting links to the Face à face tab of this match.
    expect(html).toContain(fr["matches.pre.last_meeting"]);
    expect(html).toMatch(/href="\/matches\/next\?tab=h2h"/);
    expect(html).toContain(fr["matches.pre.see_h2h"]);
  });

  it("puts a dash, never a 0, where the table is not in hand", async () => {
    const html = await render({ standings: undefined });
    expect(tile(html, "Raja")).toEqual({ position: "—", points: "—" });
    expect(tile(html, "HUSA")).toEqual({ position: "—", points: "—" });
    // No form: the chips' own dash.
    expect(html.match(/role="img"/g)).toBeNull();
  });

  it("puts a dash for a club that has no row yet", async () => {
    const html = await render({ standings: [row("raja", 1, 3, ["W"])] });
    expect(tile(html, "Raja")).toEqual({ position: "1", points: "3" });
    expect(tile(html, "HUSA")).toEqual({ position: "—", points: "—" });
  });

  it("leaves the last-meeting row out when the clubs have no earlier result", async () => {
    const html = await render({ meetings: [] });
    expect(html).not.toContain(fr["matches.pre.last_meeting"]);
    expect(html).not.toContain("tab=h2h");
  });

  it("says the hour is to be confirmed, and counts nothing down, for a placeholder kick-off", async () => {
    const html = await render({}, { ...fixture, kickoff: "2099-10-28T00:00:00.000Z" });
    expect(html).toContain(fr["matches.kickoff_unconfirmed"]);
    expect(html).not.toContain("heure du Maroc");
    expect(html).not.toContain(fr["matches.pre.starts_in"]);
  });

  it("has an Arabic line for every word it prints", () => {
    const ar = dictionaries.ar;
    for (const key of [
      "matches.pre.title",
      "matches.pre.starts_in",
      "matches.pre.kickoff_at",
      "matches.pre.standing",
      "matches.pre.form_note",
      "matches.pre.last_meeting",
      "matches.pre.see_h2h",
      "matches.detail.events_more_both",
      "matches.detail.events_more_assists",
    ] as const) {
      expect(ar[key]).toMatch(/[؀-ۿ]/);
    }
  });
});
