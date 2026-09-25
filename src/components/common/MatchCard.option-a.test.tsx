import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import type { ReactElement } from "react";
import { renderToString } from "react-dom/server";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";

import { dictionaries } from "@/i18n/dictionaries";
import { I18nProvider } from "@/i18n/provider";
import { clubMatchPalettes, clubPalette } from "@/lib/club-palette";
import type { Club, Match } from "@/types/domain";
import { MatchCard, type MatchCardExtras, type MatchCardVariant } from "./MatchCard";

/**
 * Option A's match card, rendered for real: a memory router (the card is a
 * router `<Link>`) and the French dictionary, through `react-dom/server`.
 * The Arabic mirror needs no second render — it is the absence of any
 * physical utility (pinned by `MatchCard.viewport-containment.test.ts`) plus
 * home being the first child everywhere, which is asserted here.
 *
 * Clubs are production-shaped: `primaryColor` is `var(--ui-ink)` (BG-0112),
 * so the colour comes from the kit table by name, as it does in production.
 */

const fr = dictionaries.fr;

function club(fr: string, code: string): Club {
  return {
    id: `club-${code}`,
    name: { fr, ar: fr },
    shortName: { fr: code, ar: code },
    city: { fr: "", ar: "" },
    primaryColor: "var(--ui-ink)",
    crestPlaceholder: code,
  };
}

const FAR = club("AS FAR", "FAR");
const RAJA = club("Raja CA", "RCA");
const WYDAD = club("Wydad AC", "WAC");
const TETOUAN = club("Maghreb Tétouan", "MAT");

function fixture(overrides: Partial<Match> = {}): Match {
  return {
    id: "m1",
    gameweek: 14,
    homeClubId: "h",
    awayClubId: "a",
    kickoff: "2026-09-24T19:30:00Z",
    status: "scheduled",
    venue: { fr: "", ar: "" },
    ...overrides,
  };
}

async function render(node: ReactElement): Promise<string> {
  const router = createRouter({
    routeTree: createRootRoute({ component: () => node }),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  // Without React's `<!-- -->` text separators, so "J. 14" reads as written.
  return renderToString(
    <I18nProvider>
      <RouterProvider router={router} />
    </I18nProvider>,
  ).replace(/<!-- -->/g, "");
}

function card(
  match: Match,
  home: Club,
  away: Club,
  variant: MatchCardVariant = "list",
  extra: { listGameweek?: number; extras?: MatchCardExtras } = {},
) {
  return render(<MatchCard match={match} home={home} away={away} variant={variant} {...extra} />);
}

/** The class list of the element whose only text is `text`. */
function classOf(html: string, text: string): string {
  const found = new RegExp(`class="([^"]*)"[^>]*>${text}<`).exec(html);
  if (!found) throw new Error(`no element with text ${text}`);
  return found[1]!;
}

/** Every inline value of one custom property, in document order. */
function styleVars(html: string, name: string): string[] {
  return [...html.matchAll(new RegExp(`${name}:\\s*([^;"]+)`, "g"))].map((m) => m[1]!.trim());
}

const MUTED = "text-[color:var(--ui-on-surface-muted)]";
const DEFAULT = "text-[color:var(--ui-on-surface)]";

describe("MatchCard (Option A) — the list row", () => {
  it("links to the match and states the whole result in its name", async () => {
    const html = await card(fixture({ status: "finished", homeScore: 2, awayScore: 0 }), FAR, RAJA);
    const score = fr["matches.a11y.score"]
      .replace("{home}", "AS FAR")
      .replace("{hs}", "2")
      .replace("{away}", "Raja CA")
      .replace("{as}", "0");
    // The canonical match URL: `?tab=summary` made every match link a
    // redirect to another address (audit 2026-09-24, P2-20).
    expect(html).toContain('href="/matches/m1"');
    expect(html).toContain(`aria-label="${score} — ${fr["matches.a11y.status_finished"]}"`);
    // The label says it all; the drawing under it is not read twice.
    expect(html).toContain('<div aria-hidden="true">');
  });

  it("puts home first, with a club edge bar at each end and a crest disc per side", async () => {
    const html = await card(fixture(), FAR, RAJA);
    expect(html.indexOf(">AS FAR<")).toBeLessThan(html.indexOf(">Raja CA<"));
    // Two edge bars (the edge colour as a fill) and two crest discs, each
    // carrying its own club palette.
    expect(html.match(/bg-\[color:var\(--ui-club-edge\)\]/g)?.length).toBe(2);
    expect(html.match(/data-club=""/g)?.length).toBe(4);
    expect(styleVars(html, "--club-fill-l")).toEqual([
      clubPalette(FAR).light.fill,
      clubPalette(FAR).light.fill,
      clubPalette(RAJA).light.fill,
      clubPalette(RAJA).light.fill,
    ]);
  });

  it("sets a kickoff in the display face, isolated for bidi", async () => {
    const html = await card(fixture(), FAR, RAJA);
    expect(html).toMatch(
      /<bdi class="[^"]*\[font-family:var\(--ui-font-display\)\][^"]*">\d\d:\d\d<\/bdi>/,
    );
    expect(html).not.toContain(fr["matches.status.ft"]);
  });

  it("writes a score as three children — home, dash, away — never one string", async () => {
    const html = await card(fixture({ status: "finished", homeScore: 2, awayScore: 0 }), FAR, RAJA);
    expect(html).toMatch(/<bdi>2<\/bdi><span>–<\/span><bdi>0<\/bdi>/);
    expect(html).not.toContain("2 – 0");
  });

  it("quietens the loser of a finished match and says it is over", async () => {
    const html = await card(fixture({ status: "finished", homeScore: 2, awayScore: 0 }), FAR, RAJA);
    const winner = classOf(html, "AS FAR");
    const loser = classOf(html, "Raja CA");
    expect(winner).toContain(DEFAULT);
    expect(winner).toContain("[font-weight:var(--ui-weight-heavy)]");
    expect(loser).toContain(MUTED);
    expect(loser).toContain("[font-weight:var(--ui-weight-strong)]");
    expect(html).toContain(`>${fr["matches.status.ft"]}<`);
  });

  it("quietens neither side of a draw, nor of a match still to play", async () => {
    const draw = await card(fixture({ status: "finished", homeScore: 1, awayScore: 1 }), FAR, RAJA);
    expect(classOf(draw, "AS FAR")).toContain(DEFAULT);
    expect(classOf(draw, "Raja CA")).toContain(DEFAULT);
    const upcoming = await card(fixture(), FAR, RAJA);
    expect(classOf(upcoming, "Raja CA")).toContain(DEFAULT);
  });

  it("lets a shoot-out decide the loser of a level score", async () => {
    const html = await card(
      fixture({ status: "finished", homeScore: 1, awayScore: 1 }),
      FAR,
      RAJA,
      "list",
      {
        extras: { displayStatus: "penalties", penaltiesScore: { home: 4, away: 5 } },
      },
    );
    expect(classOf(html, "AS FAR")).toContain(MUTED);
    expect(classOf(html, "Raja CA")).toContain(DEFAULT);
  });

  it("gives a live row the navy pill on a line of its own, and its name the minute", async () => {
    const html = await card(
      fixture({ status: "live", minute: 63, homeScore: 1, awayScore: 1 }),
      WYDAD,
      FAR,
    );
    // The pill spans the three middle tracks, so it never widens the score's
    // track and squeezes the names (measured: "Wydad AC" truncated at 390px).
    expect(html).toContain("col-[2/5]");
    expect(html).toContain("row-span-2");
    expect(html).toContain(`>${fr["matches.status.live"]}<`);
    expect(html).toContain("63′");
    expect(html).toContain("bg-[color:var(--ui-ink)]");
    expect(html).toContain(fr["matches.a11y.live_minute"].replace("{minute}", "63"));
  });

  it("names the round only when the page has not already named it", async () => {
    const same = await card(fixture(), FAR, RAJA, "list", { listGameweek: 14 });
    expect(same).not.toContain(`${fr["matches.gameweek"]} 14`);
    const other = await card(fixture(), FAR, RAJA, "list", { listGameweek: 13 });
    expect(other).toContain(`${fr["matches.gameweek"]} 14`);
    const compact = await card(fixture(), FAR, RAJA, "compact", { listGameweek: 14 });
    expect(compact).toContain(`${fr["matches.gameweek"]} 14`);
  });

  it("truncates a club name on one line and never breaks it inside a word", async () => {
    const html = await card(fixture(), club("Renaissance Sportive de Berkane", "RSB"), RAJA);
    expect(classOf(html, "Renaissance Sportive de Berkane")).toContain("truncate");
    // `break-words` is what printed "Wyda / d AC" once the crest disc grew.
    expect(html).not.toMatch(/break-words|break-all|overflow-wrap|word-break/);
  });

  it("is its own card as a row or compact, and a flat row inside a caller's card as a list", async () => {
    const list = await card(fixture(), FAR, RAJA, "list");
    const row = await card(fixture(), FAR, RAJA, "row");
    const compact = await card(fixture(), FAR, RAJA, "compact");
    expect(list).not.toContain("shadow-[var(--ui-shadow-card)]");
    expect(list).toContain("focus-visible:ring-inset");
    for (const html of [row, compact]) {
      expect(html).toContain("rounded-[var(--ui-radius-card)]");
      expect(html).toContain("shadow-[var(--ui-shadow-card)]");
    }
  });
});

describe("MatchCard (Option A) — the home/away clash rule", () => {
  it("paints the away side in the pair's resolved colour, edge and crest alike", async () => {
    const pair = clubMatchPalettes(WYDAD, TETOUAN);
    expect(pair.clash).toBe(true);
    const html = await card(fixture(), WYDAD, TETOUAN);
    const fills = styleVars(html, "--club-fill-l");
    // home edge, home crest, away crest, away edge
    expect(fills).toEqual([
      pair.home.light.fill,
      pair.home.light.fill,
      pair.away.light.fill,
      pair.away.light.fill,
    ]);
    expect(fills[3]).not.toBe(clubPalette(TETOUAN).light.fill);
  });
});

describe("MatchCard (Option A) — Home's live hero", () => {
  const live = fixture({ status: "live", minute: 63, homeScore: 1, awayScore: 1 });

  it("splits the card into the two club colours, home first, with inverse crest discs", async () => {
    const html = await card(live, WYDAD, FAR, "hero");
    const pair = clubMatchPalettes(WYDAD, FAR);
    // Each half is a club block; each crest is a surface disc on it.
    expect(
      html.match(/bg-\[color:var\(--ui-club\)\] text-\[color:var\(--ui-on-club\)\]/g)?.length,
    ).toBe(2);
    expect(
      html.match(/bg-\[color:var\(--ui-surface\)\] text-\[color:var\(--ui-club-fg\)\]/g)?.length,
    ).toBe(2);
    expect(styleVars(html, "--club-fill-l")[0]).toBe(pair.home.light.fill);
    expect(html.indexOf(">Wydad AC<")).toBeLessThan(html.indexOf(">AS FAR<"));
  });

  it("centres a light score box and the live pill over the seam, without a physical offset", async () => {
    const html = await card(live, WYDAD, FAR, "hero");
    expect(html).toContain("bg-[color:var(--ui-scorebox)]");
    expect(html).toMatch(/<bdi>1<\/bdi><span>–<\/span><bdi>1<\/bdi>/);
    expect(html).toContain("absolute inset-x-0 top-4 mx-auto flex w-fit");
    expect(html).not.toMatch(/\b(left|right)-1\/2\b|translate-x/);
    expect(html).toContain(`>${fr["matches.status.live"]}<`);
  });

  it("wraps a long name between words over two lines at most", async () => {
    const html = await card(live, club("Renaissance Sportive de Berkane", "RSB"), FAR, "hero");
    const name = classOf(html, "Renaissance Sportive de Berkane");
    expect(name).toContain("line-clamp-2");
    expect(name).not.toMatch(/break-|overflow-wrap/);
  });

  it("is a feature surface: the sheet radius and the lifted shadow", async () => {
    const html = await card(live, WYDAD, FAR, "hero");
    expect(html).toContain("rounded-[var(--ui-radius-sheet)]");
    expect(html).toContain("shadow-[var(--ui-shadow-lifted)]");
  });
});

describe("MatchCard (Option A) — source", () => {
  const source = readFileSync(new URL("./MatchCard.tsx", import.meta.url), "utf8");

  it("draws club colour only through the palette, never a literal", () => {
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|bg-white|text-white/);
    expect(source).toContain("clubMatchPalettes(home, away)");
  });
});
