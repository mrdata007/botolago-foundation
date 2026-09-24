import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { MatchStatisticComparisonDto } from "@/backend/football/contracts";
import { dictionaries } from "@/i18n/dictionaries";
import { I18nProvider } from "@/i18n/provider";
import { clubMatchPalettes } from "@/lib/club-palette";
import type { MatchEvent } from "@/services/match-live";
import type { Club, Match } from "@/types/domain";
import { EventTimeline } from "./EventTimeline";
import { MatchScoreHeader } from "./MatchScoreHeader";
import { MATCH_TABS } from "./MatchTabs";
import { FormChips } from "./StandingsTable";
import { StatComparison } from "./StatComparison";

/**
 * Option A — the match page (A-Match, A-Stats, A-Lineups, A-H2H, A-Goal).
 *
 * The rules every screen owes the design system, checked on this lane's
 * files as source (logical properties, `ltr:`-only tracking, no literal
 * colour, no `<bdi>` as a score's flex container), and the decisions the
 * page made, checked on rendered markup so a later edit cannot quietly walk
 * them back.
 */

const ROOT = join(import.meta.dir, "..", "..", "..");
/** Source without comments, so a note that NAMES a forbidden construct does not trip a rule. */
const code = (path: string) =>
  readFileSync(join(ROOT, path), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

const FILES = [
  "src/routes/matches.$matchId.tsx",
  "src/components/matches/MatchScoreHeader.tsx",
  "src/components/matches/MatchTopBar.tsx",
  "src/components/matches/MatchTabs.tsx",
  "src/components/matches/EventTimeline.tsx",
  "src/components/matches/StatComparison.tsx",
  "src/components/matches/LineupsView.tsx",
  "src/components/matches/HeadToHead.tsx",
  "src/components/matches/StandingsTable.tsx",
  "src/components/matches/GoalMoment.tsx",
  "src/components/matches/BallIcon.tsx",
];

describe("match page — design-system rules in source", () => {
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
    it(`${file}: no angled gradient, and never a <bdi> as a score's flex container`, () => {
      expect(source).not.toMatch(/gradient\([^)]*\d+deg/);
      expect(source).not.toMatch(/<bdi[^>]*className=[^>]*\bflex\b/);
    });
  }

  it("the page takes no News data while the flag is off, and never strands a cold reader", () => {
    const route = code("src/routes/matches.$matchId.tsx");
    expect(route).toContain("{NEWS_ENABLED && related.length > 0 && (");
    expect(route).toContain('useBackTo("/matches")');
    expect(route).not.toContain("history.back()");
  });

  it("seeds the detail query with the loader's payload, so the server and the first render agree", () => {
    const route = code("src/routes/matches.$matchId.tsx");
    expect(route).toMatch(/return \{ detail \};/);
    expect(route).toMatch(/initialData: serverDetail/);
  });
});

describe("match page — copy", () => {
  it("the tabs use the short labels, which fit a 390px column in Changa", () => {
    expect(MATCH_TABS.map((tab) => dictionaries.fr[tab.label])).toEqual([
      "Résumé",
      "Stats",
      "Compos",
      "Face à face",
    ]);
    for (const tab of MATCH_TABS) expect(dictionaries.ar[tab.label]).toMatch(/[؀-ۿ]/);
  });

  it("the goal moment's word is BUT ! in French and هدف! in Arabic", () => {
    expect(dictionaries.fr["matches.detail.goal_title"]).toBe("BUT !");
    expect(dictionaries.ar["matches.detail.goal_title"]).toBe("هدف!");
  });

  it("form letters are translated: V/N/D and ف/ت/خ, never the data's W/D/L", () => {
    const letters = (lang: "fr" | "ar") =>
      [
        dictionaries[lang]["matches.table.form_win_short"],
        dictionaries[lang]["matches.table.form_draw_short"],
        dictionaries[lang]["matches.table.form_loss_short"],
      ].join("");
    expect(letters("fr")).toBe("VND");
    expect(letters("ar")).toBe("فتخ");
  });
});

// ---------------------------------------------------------------- markup

const inFrench = (node: ReactElement) => renderToStaticMarkup(<I18nProvider>{node}</I18nProvider>);

const club = (id: string, name: string, short: string, code: string, city: string): Club => ({
  id,
  slug: id,
  name: { fr: name, ar: name },
  shortName: { fr: short, ar: short },
  city: { fr: city, ar: city },
  primaryColor: "var(--ui-ink)",
  crestPlaceholder: code,
});
const wydad = club("war", "Wydad AC", "WAC", "WAC", "Casablanca");
const far = club("asfar", "AS FAR", "FAR", "FAR", "Rabat");
const palettes = clubMatchPalettes(wydad, far);

const live: Match = {
  id: "m1",
  gameweek: 14,
  homeClubId: "war",
  awayClubId: "asfar",
  kickoff: "2026-09-24T19:00:00.000Z",
  status: "live",
  minute: 63,
  homeScore: 2,
  awayScore: 1,
  venue: { fr: "Stade Mohammed V", ar: "ملعب محمد الخامس" },
};

const event = (
  id: string,
  type: MatchEvent["type"],
  side: MatchEvent["side"],
  minute: number,
  addedTime = 0,
): MatchEvent => ({
  id,
  type,
  detail: null,
  teamId: side === "home" ? "war" : side === "away" ? "asfar" : null,
  playerId: null,
  relatedPlayerId: null,
  minute,
  addedTime,
  sequence: minute,
  period: minute > 45 ? "second_half" : "first_half",
  side,
  clubId: side === "home" ? "war" : side === "away" ? "asfar" : null,
});

describe("match page — the split header", () => {
  const html = inFrench(
    <MatchScoreHeader
      match={live}
      home={wydad}
      away={far}
      palettes={palettes}
      elapsed={63}
      headingId="h"
    />,
  );

  it("names the fixture in the page's h1", () => {
    expect(html).toMatch(/<h1 id="h"[^>]*>Wydad AC vs AS FAR<\/h1>/);
  });

  it("announces the score once, as a sentence, and hides the glyphs", () => {
    expect(html).toMatch(/aria-live="polite" aria-atomic="true"/);
    expect(html).toContain("Score : WAC 2, FAR 1");
    // Three flex children in a plain (direction-inheriting) container.
    expect(html).toMatch(
      /<span aria-hidden="true" class="flex[^"]*"><bdi>2<\/bdi><span>–<\/span><bdi>1<\/bdi><\/span>/,
    );
  });

  it("paints each half in its club's resolved palette, home first", () => {
    const halves = [...html.matchAll(/<div data-club="" style="([^"]*)" class="[^"]*flex-1/g)];
    expect(halves).toHaveLength(2);
    expect(halves[0]![1]).toContain(palettes.home.light.fill);
    expect(halves[1]![1]).toContain(palettes.away.light.fill);
    // The seam padding is logical: the home half's inline end, the away half's inline start.
    expect(html).toMatch(/flex-1[^"]*pe-16/);
    expect(html).toMatch(/flex-1[^"]*ps-16/);
  });

  it("says the match is live with the kit's pill, and fills the elapsed bar from the inline start", () => {
    expect(html).toContain("En direct");
    expect(html).toContain("width:70%");
  });
});

describe("match page — the Résumé timeline", () => {
  const html = inFrench(
    <EventTimeline
      events={[
        event("g1", "goal", "home", 12),
        event("c1", "yellow_card", "away", 33),
        event("p1", "penalty_goal", "away", 45, 2),
        event("pe", "period_end", null, 45, 3),
        event("ps", "period_start", null, 46),
        event("s1", "substitution", "home", 58),
      ]}
      home={wydad}
      away={far}
      palettes={palettes}
      isLive
    />,
  );

  it("puts a home event's edge on the inline start and an away event's on the inline end", () => {
    const cards = [...html.matchAll(/<div data-club=""[^>]*class="([^"]*)"/g)].map((m) => m[1]!);
    expect(cards).toHaveLength(4);
    expect(cards[0]).toContain("border-s-4");
    expect(cards[1]).toContain("border-e-4");
    expect(cards[2]).toContain("border-e-4");
    expect(cards[3]).toContain("border-s-4");
  });

  it("isolates each minute, stoppage time included, with the prime in the body face", () => {
    expect(html).toMatch(/<bdi[^>]*>12<span class="[^"]*">′<\/span><\/bdi>/);
    expect(html).toMatch(/<bdi[^>]*>45(?:<!-- -->)?\+2<span class="[^"]*">′<\/span><\/bdi>/);
  });

  it("draws the end of the first half as MI-TEMPS and no other period boundary", () => {
    expect(html.match(/Mi-temps/g)).toHaveLength(1);
    expect(html).not.toContain("Début de période");
    expect(html).not.toContain("Fin de période");
  });
});

describe("match page — the Stats tab", () => {
  const stat = (
    code: string,
    label: string,
    homeValue: number,
    awayValue: number,
    valueType: MatchStatisticComparisonDto["valueType"] = "integer",
  ): MatchStatisticComparisonDto => ({
    code,
    label,
    valueType,
    unit: valueType === "percentage" ? "percent" : "count",
    homeValue,
    homeDisplayValue: null,
    awayValue,
    awayDisplayValue: null,
  });
  const html = inFrench(
    <StatComparison
      stats={[
        stat("possession", "Possession", 54, 46, "percentage"),
        stat("shots_on_target", "Shots on target", 4, 3),
        stat("fouls", "Fouls", 9, 12),
        stat("expected_goals_2", "Expected goals (provider)", 1, 1),
      ]}
      home={wydad}
      away={far}
      palettes={palettes}
      isLive
    />,
  );

  it("names a known statistic in the reader's language, not the API's English label", () => {
    expect(html).toContain("Tirs cadrés");
    expect(html).not.toContain("Shots on target");
    expect(html).toContain("Fautes");
    // An unknown code keeps the provider's label rather than disappearing.
    expect(html).toContain("Expected goals (provider)");
  });

  it("never prints the unit word, only a percent sign where it is a percentage", () => {
    expect(html).not.toContain("count");
    expect(html).not.toContain("percent<");
    expect(html).toMatch(/54<span class="[^"]*">%<\/span>/);
  });

  it("sets every figure on the tabular stat ramp, not the display face", () => {
    const figures = [...html.matchAll(/<bdi class="([^"]*)">\d/g)].map((m) => m[1]!);
    expect(figures.length).toBeGreaterThan(0);
    for (const classes of figures) {
      expect(classes).toContain("fpl-tabular");
      expect(classes).not.toContain("--ui-font-display");
    }
  });

  it("puts the higher figure in a pill of its club's colour, and neither on a tie", () => {
    // 4 v 3: home leads; 9 v 12: away leads; 1 v 1: nobody.
    const cells = [
      ...html.matchAll(
        /<span (?:data-club="" style="([^"]*)" )?class="inline-flex h-6 min-w-9[^"]*"/g,
      ),
    ];
    expect(cells).toHaveLength(6);
    const filled = cells.map((cell) => cell[0].includes("bg-[color:var(--ui-club)]"));
    expect(filled).toEqual([true, false, false, true, false, false]);
    // Each pill carries its own side's colours.
    expect(cells[0]![1]).toContain(palettes.home.light.fill);
    expect(cells[3]![1]).toContain(palettes.away.light.fill);
  });
});

describe("match page — form chips", () => {
  const html = inFrench(<FormChips form={["W", "D", "L"]} />);

  it("prints the translated letter and names each result", () => {
    expect(html).toMatch(/aria-label="Victoire"[^>]*><span aria-hidden="true">V<\/span>/);
    expect(html).toMatch(/aria-label="Nul"[^>]*><span aria-hidden="true">N<\/span>/);
    expect(html).toMatch(/aria-label="Défaite"[^>]*><span aria-hidden="true">D<\/span>/);
  });

  it("puts each status fill's own foreground on it, never plain white", () => {
    expect(html).toContain("bg-[color:var(--ui-positive)] text-[color:var(--ui-on-positive)]");
    expect(html).toContain("bg-[color:var(--ui-negative)] text-[color:var(--ui-on-negative)]");
    expect(html).not.toContain("--ui-on-ink-plain");
  });
});
