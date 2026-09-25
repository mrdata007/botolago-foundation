import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { FIXTURE_STATUSES, type FixtureStatus } from "@/backend/football/contracts";
import { MockFootballRepository } from "@/backend/football/mock-repository";
import { dictionaries, type TranslationKey } from "@/i18n/dictionaries";
import { I18nProvider } from "@/i18n/provider";
import { clubMatchPalettes } from "@/lib/club-palette";
import { POST_KICKOFF_REFRESH_MINUTES } from "@/lib/match-refresh";
import { toMatch } from "@/services/football";
import type { Club, Language, Match } from "@/types/domain";
import { EventTimeline } from "./EventTimeline";
import { LineupsView } from "./LineupsView";
import {
  matchDataPhase,
  noEventsMessage,
  noLineupsMessage,
  noStatsMessage,
  type MatchDataPhase,
} from "./match-empty-states";
import { StatComparison } from "./StatComparison";

/**
 * Audit A07: a finished 1–3 match's Stats tab said "Les statistiques seront
 * disponibles au coup d'envoi." An empty panel's message now follows the
 * match's state, and after the final whistle it promises nothing.
 */

const inLanguage = (lang: Language) => (key: TranslationKey) => dictionaries[lang][key];
const PHASES: readonly MatchDataPhase[] = [
  "upcoming",
  "awaiting",
  "live",
  "finished",
  "unreported",
  "postponed",
  "called_off",
];
/** The phases in which nothing more will come by itself: their copy promises nothing. */
const SETTLED = ["finished", "unreported", "postponed", "called_off"] as const;
const MESSAGES = { stats: noStatsMessage, events: noEventsMessage, lineups: noLineupsMessage };

describe("matchDataPhase", () => {
  const expected: Record<FixtureStatus, MatchDataPhase> = {
    scheduled: "upcoming",
    not_started: "upcoming",
    delayed: "upcoming",
    live_first_half: "live",
    half_time: "live",
    live_second_half: "live",
    extra_time: "live",
    penalties: "live",
    finished: "finished",
    postponed: "postponed",
    suspended: "postponed",
    cancelled: "called_off",
    abandoned: "called_off",
  };

  test("reads every provider status the way the page presents it", async () => {
    const [fixture] = await new MockFootballRepository().getHomeMatches("fr", 1, {
      actorId: null,
      requestId: "test",
    });
    // Read a day before kick-off, where "scheduled" still means what it says.
    const asOf = Date.parse(fixture!.kickoffAt) - 24 * 60 * 60_000;
    for (const status of FIXTURE_STATUSES) {
      expect([status, matchDataPhase(toMatch({ ...fixture!, status }), asOf)]).toEqual([
        status,
        expected[status],
      ]);
    }
    // Twenty minutes past kick-off, a match not yet reported under way — a
    // delayed start among them — is awaited; nothing else changes.
    const late = Date.parse(fixture!.kickoffAt) + 20 * 60_000;
    for (const status of FIXTURE_STATUSES) {
      const phase = expected[status] === "upcoming" ? "awaiting" : expected[status];
      expect([status, matchDataPhase(toMatch({ ...fixture!, status }), late)]).toEqual([
        status,
        phase,
      ]);
    }
  });

  describe("a match still reported as scheduled", () => {
    const kickoff = "2026-09-20T19:00:00Z";
    const at = (minutes: number) => Date.parse(kickoff) + minutes * 60_000;
    const scheduled: Pick<Match, "status" | "kickoff" | "calledOff"> = {
      status: "scheduled",
      kickoff,
    };

    test("is upcoming until kick-off", () => {
      expect(matchDataPhase(scheduled, at(-60))).toBe("upcoming");
      expect(matchDataPhase(scheduled, at(-1))).toBe("upcoming");
    });

    test("is awaited while the page still checks for it after kick-off", () => {
      expect(matchDataPhase(scheduled, at(0))).toBe("awaiting");
      expect(matchDataPhase(scheduled, at(45))).toBe("awaiting");
      expect(matchDataPhase(scheduled, at(POST_KICKOFF_REFRESH_MINUTES))).toBe("awaiting");
    });

    test("is unreported once the page has stopped checking: it promises no kick-off data", () => {
      // The audit's case, turned around: days after its kick-off, a fixture
      // the feed never moved on still said "au coup d'envoi".
      expect(matchDataPhase(scheduled, at(POST_KICKOFF_REFRESH_MINUTES + 1))).toBe("unreported");
      expect(matchDataPhase(scheduled, at(3 * 24 * 60))).toBe("unreported");
      expect(noStatsMessage("unreported", inLanguage("fr"))).toBe(
        "Les statistiques de ce match ne sont pas disponibles.",
      );
    });

    test("with no readable kick-off, stays upcoming rather than guessing", () => {
      expect(matchDataPhase({ status: "scheduled", kickoff: "" }, at(10_000))).toBe("upcoming");
    });
  });
});

describe("empty-panel copy", () => {
  test("every panel has its own words for every phase, in French and Arabic", () => {
    for (const lang of ["fr", "ar"] as const) {
      const t = inLanguage(lang);
      for (const message of Object.values(MESSAGES)) {
        const lines = PHASES.map((phase) => message(phase, t));
        for (const line of lines) expect(line.trim().length).toBeGreaterThan(0);
        // Upcoming, live and finished never share a line.
        const [upcoming, , live, finished] = lines;
        expect(new Set([upcoming, live, finished]).size).toBe(3);
        // Awaiting a late start says what live says; unreported, what finished says.
        expect(message("awaiting", t)).toBe(live!);
        expect(message("unreported", t)).toBe(finished!);
        if (lang === "ar") for (const line of lines) expect(line).toMatch(/[؀-ۿ]/);
      }
    }
  });

  test("after the final whistle, for a match called off, or once the page stops checking, nothing is promised", () => {
    // Future tense and "not yet", the words of a promise.
    const promises = {
      fr: /seront|sera |coup d'envoi|pas encore|pour le moment|pour l'instant|se met à jour/i,
      ar: /ستتوفر|ستظهر|سيتم|عند انطلاق|بعد\.|حتى الآن|تلقائي/,
    };
    for (const lang of ["fr", "ar"] as const) {
      for (const message of Object.values(MESSAGES)) {
        for (const phase of SETTLED) {
          expect(message(phase, inLanguage(lang))).not.toMatch(promises[lang]);
        }
      }
    }
    expect(noStatsMessage("finished", inLanguage("fr"))).toBe(
      "Les statistiques de ce match ne sont pas disponibles.",
    );
    expect(noStatsMessage("finished", inLanguage("ar"))).toBe("إحصائيات هذه المباراة غير متوفرة.");
  });

  test("before kick-off the Stats tab still says when its figures come", () => {
    expect(noStatsMessage("upcoming", inLanguage("fr"))).toBe(
      "Les statistiques seront disponibles au coup d'envoi.",
    );
  });
});

// ---------------------------------------------------------------- markup

const inFrench = (node: ReactElement) =>
  renderToStaticMarkup(<I18nProvider>{node}</I18nProvider>).replace(/<!-- -->/g, "");

const club = (id: string, name: string): Club => ({
  id,
  slug: id,
  name: { fr: name, ar: name },
  shortName: { fr: name, ar: name },
  city: { fr: "", ar: "" },
  primaryColor: "var(--ui-ink)",
  crestPlaceholder: name.slice(0, 3).toUpperCase(),
});
const home = club("amal-tiznit", "Amal Tiznit");
const away = club("ittihad-tanger", "Ittihad Tanger");
const palettes = clubMatchPalettes(home, away);

describe("a finished match with no detail data", () => {
  test("the Stats tab says the statistics are not available, not that they come at kick-off", () => {
    const html = inFrench(
      <StatComparison
        stats={[]}
        home={home}
        away={away}
        palettes={palettes}
        isLive={false}
        phase="finished"
      />,
    );
    expect(html).toContain("Les statistiques de ce match ne sont pas disponibles.");
    expect(html).not.toContain("coup d'envoi");
  });

  test("the Résumé tab does not say there has been nothing of note", () => {
    const html = inFrench(
      <EventTimeline
        events={[]}
        home={home}
        away={away}
        palettes={palettes}
        isLive={false}
        phase="finished"
      />,
    );
    expect(html).toContain("Les faits marquants de ce match ne sont pas disponibles.");
    expect(html).not.toContain("pour le moment");
  });

  test("the Compos tab does not say the lineups are not published yet", () => {
    const html = inFrench(
      <LineupsView lineups={[]} home={home} away={away} palettes={palettes} phase="finished" />,
    );
    expect(html).toContain("Les compositions de ce match ne sont pas disponibles.");
    expect(html).not.toContain("pas encore");
  });
});

describe("the other phases on screen", () => {
  test("a live match's empty Stats tab says nothing has arrived yet and the page refreshes", () => {
    const html = inFrench(
      <StatComparison stats={[]} home={home} away={away} palettes={palettes} isLive phase="live" />,
    );
    expect(html).toContain("Aucune statistique reçue pour l&#x27;instant.");
    expect(html).toContain("Cette page se met à jour automatiquement.");
  });

  test("a postponed or called-off match says so on every panel", () => {
    const postponed = inFrench(
      <LineupsView lineups={[]} home={home} away={away} palettes={palettes} phase="postponed" />,
    );
    expect(postponed).toContain("Match reporté : pas de données à afficher.");
    const calledOff = inFrench(
      <EventTimeline
        events={[]}
        home={home}
        away={away}
        palettes={palettes}
        isLive={false}
        phase="called_off"
      />,
    );
    expect(calledOff).toContain("Match annulé ou arrêté : pas de données à afficher.");
  });
});

describe("the match page", () => {
  const route = readFileSync(
    join(import.meta.dir, "..", "..", "routes", "matches.$matchId.tsx"),
    "utf8",
  );

  test("works the phase out as of the query's own read, and hands it to all three panels", () => {
    // Not `Date.now()`: the server and the browser's first render must agree.
    expect(route).toContain("const phase = matchDataPhase(match, detailQ.dataUpdatedAt);");
    for (const panel of ["EventTimeline", "StatComparison", "LineupsView"]) {
      const element = route.match(new RegExp(`<${panel}\\b[^>]*?/>`))?.[0] ?? "";
      expect([panel, /\bphase=\{phase\}/.test(element)]).toEqual([panel, true]);
    }
  });
});
