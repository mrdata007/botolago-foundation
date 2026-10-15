import { describe, expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import type { ReactElement } from "react";
import { renderToString } from "react-dom/server";

import { MatchCard } from "@/components/common/MatchCard";
import { dictionaries } from "@/i18n/dictionaries";
import { I18nProvider } from "@/i18n/provider";
import { clubMatchPalettes } from "@/lib/club-palette";
import { matchBucket } from "@/lib/match-bucket";
import { matchOffStatus } from "@/lib/match-off-status";
import type { Club, Match, MatchOffStatus } from "@/types/domain";
import { MatchScoreHeader } from "./MatchScoreHeader";
import { offStatusA11y, offStatusLabel, offStatusNotice } from "./off-status-copy";

/**
 * Audit DATA-04: a postponed, a suspended, a cancelled and an abandoned match
 * are four different things, and each says so: its pill, its sentence on the
 * match page, its card's name for a screen reader, and where the day's list
 * files it. Only "postponed" waits for a new date.
 */

const OFF: readonly MatchOffStatus[] = ["postponed", "suspended", "cancelled", "abandoned"];
const inLanguage = (lang: "fr" | "ar") => (key: keyof typeof dictionaries.fr) =>
  dictionaries[lang][key];

const club = (id: string, name: string): Club => ({
  id,
  slug: id,
  name: { fr: name, ar: name },
  shortName: { fr: name, ar: name },
  city: { fr: "", ar: "" },
  primaryColor: "var(--ui-ink)",
  crestPlaceholder: id.toUpperCase(),
});
const fus = club("fus", "FUS");
const raja = club("rca", "Raja");
const palettes = clubMatchPalettes(fus, raja);

/** A match as `toMatch` presents each provider status in the postponed group. */
const PRESENTED: Record<MatchOffStatus, Partial<Match>> = {
  postponed: { offStatus: "postponed", dateUnconfirmed: true, calledOff: false },
  suspended: { offStatus: "suspended", dateUnconfirmed: false, calledOff: false },
  cancelled: { offStatus: "cancelled", dateUnconfirmed: true, calledOff: true },
  abandoned: { offStatus: "abandoned", dateUnconfirmed: false, calledOff: true },
};
const match = (off: MatchOffStatus): Match => ({
  id: "m1",
  gameweek: 4,
  homeClubId: "fus",
  awayClubId: "rca",
  kickoff: "2026-10-13T20:00:00.000Z",
  status: "postponed",
  venue: { fr: "Stade", ar: "Stade" },
  ...PRESENTED[off],
});

async function render(node: ReactElement): Promise<string> {
  const router = createRouter({
    routeTree: createRootRoute({ component: () => node }),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  return renderToString(
    <QueryClientProvider client={new QueryClient()}>
      <I18nProvider>
        <RouterProvider router={router} />
      </I18nProvider>
    </QueryClientProvider>,
  ).replace(/<!-- -->/g, "");
}

describe("the four states are told apart", () => {
  test("matchOffStatus reads the provider's word, and a bare postponed or called-off match narrowly", () => {
    expect(OFF.map((off) => matchOffStatus(match(off)))).toEqual([...OFF]);
    // Fixtures built without a provider status (the mocks).
    expect(matchOffStatus({ status: "postponed" })).toBe("postponed");
    expect(matchOffStatus({ status: "postponed", calledOff: true })).toBe("cancelled");
    for (const status of ["scheduled", "live", "finished"] as const) {
      expect(matchOffStatus({ status, offStatus: "cancelled" })).toBeNull();
    }
  });

  test("each state has its own pill, sentence and spoken name, in French and Arabic", () => {
    for (const lang of ["fr", "ar"] as const) {
      const t = inLanguage(lang);
      for (const read of [offStatusLabel, offStatusNotice, offStatusA11y]) {
        const lines = OFF.map((off) => read(off, t));
        expect([lang, read.name, new Set(lines).size]).toEqual([lang, read.name, 4]);
        for (const line of lines) expect(line.trim().length).toBeGreaterThan(0);
        if (lang === "ar") for (const line of lines) expect(line).toMatch(/[؀-ۿ]/);
      }
    }
  });

  test("the French words are the ones the product already uses beside them", () => {
    const t = inLanguage("fr");
    expect(OFF.map((off) => offStatusLabel(off, t))).toEqual([
      "Reporté",
      "Interrompu",
      "Annulé",
      "Arrêté",
    ]);
  });

  test("only a postponed match promises a new date", () => {
    for (const lang of ["fr", "ar"] as const) {
      const t = inLanguage(lang);
      const promise = lang === "fr" ? /nouvelle date|reprise|reprendr/i : /موعد جديد|استئناف/;
      expect(offStatusNotice("postponed", t)).toMatch(promise);
      for (const off of ["suspended", "cancelled", "abandoned"] as const) {
        expect(offStatusNotice(off, t)).not.toMatch(promise);
      }
    }
  });

  test("a cancelled or abandoned match is filed apart from the matches still to come", () => {
    const bucket = (off: MatchOffStatus) => matchBucket(match(off));
    expect(OFF.map(bucket)).toEqual(["other", "other", "called_off", "called_off"]);
    expect(matchBucket({ status: "scheduled" })).toBe("upcoming");
    expect(matchBucket({ status: "live" })).toBe("live");
    expect(matchBucket({ status: "finished" })).toBe("finished");
  });
});

describe("on screen", () => {
  const header = (off: MatchOffStatus) =>
    render(
      <MatchScoreHeader
        match={match(off)}
        home={fus}
        away={raja}
        palettes={palettes}
        elapsed={0}
        headingId="h"
      />,
    );

  test("the match page names the state in its pill and its sentence", async () => {
    const expected: Record<MatchOffStatus, [string, string]> = {
      postponed: ["Reporté", "Ce match a été reporté. Nouvelle date à confirmer."],
      suspended: ["Interrompu", "Ce match a été interrompu."],
      cancelled: ["Annulé", "Ce match a été annulé."],
      abandoned: ["Arrêté", "Ce match a été arrêté avant son terme."],
    };
    for (const off of OFF) {
      const html = await header(off);
      const [pill, notice] = expected[off];
      expect([off, html.includes(`>${pill}</span>`)]).toEqual([off, true]);
      expect([off, html.includes(notice)]).toEqual([off, true]);
      // Never another state's word.
      for (const other of OFF.filter((candidate) => candidate !== off)) {
        expect([off, html.includes(`>${expected[other][0]}</span>`)]).toEqual([off, false]);
      }
    }
  });

  test("a suspended or abandoned match keeps its date: it kicked off", async () => {
    for (const off of ["suspended", "abandoned"] as const) {
      expect(await header(off)).not.toContain(dictionaries.fr["matches.kickoff_date_unconfirmed"]);
    }
    for (const off of ["postponed", "cancelled"] as const) {
      expect(await header(off)).toContain(dictionaries.fr["matches.kickoff_date_unconfirmed"]);
    }
  });

  test("a card names the state for assistive technology and in its badge", async () => {
    const t = inLanguage("fr");
    for (const off of OFF) {
      const html = await render(
        <MatchCard match={match(off)} home={fus} away={raja} variant="list" />,
      );
      expect([off, html.includes(`aria-label="`)]).toEqual([off, true]);
      expect([off, html.includes(offStatusA11y(off, t))]).toEqual([off, true]);
      expect([off, html.includes(`>${offStatusLabel(off, t)}</span>`)]).toEqual([off, true]);
    }
  });
});
