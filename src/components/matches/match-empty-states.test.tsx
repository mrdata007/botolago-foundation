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
import { matchRefetchInterval, POST_KICKOFF_REFRESH_MINUTES } from "@/lib/match-refresh";
import { toMatch } from "@/services/football";
import type { Club, Language, Match } from "@/types/domain";
import { EventTimeline } from "./EventTimeline";
import { LineupsView } from "./LineupsView";
import { EmptyState, ErrorState } from "@/components/common/States";
import { MatchDataState } from "./MatchDataState";
import {
  isDataUnavailable,
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

    test("at the provider's placeholder hour, is upcoming until the end of its day", () => {
      // Before Morocco moved to UTC+0 all year (UTC+1). Midnight UTC, 01:00 in Casablanca: the day is set, the hour is not
      // (`isKickoffTimeUnconfirmed`). Read as a kick-off that had passed, it
      // said the match's data was not available from 01:00 on the very day
      // it is to be played.
      const placeholder = { status: "scheduled" as const, kickoff: "2026-09-13T00:00:00Z" };
      const phaseAt = (iso: string) => matchDataPhase(placeholder, Date.parse(iso));
      // 02:00, 23:00 and 23:59 in Casablanca, the same day.
      expect(phaseAt("2026-09-13T01:00:00Z")).toBe("upcoming");
      expect(phaseAt("2026-09-13T22:00:00Z")).toBe("upcoming");
      expect(phaseAt("2026-09-13T22:59:00Z")).toBe("upcoming");
      // Midnight and 01:30 the next day in Casablanca, whatever the UTC date
      // says: the day is over, and the feed never moved the match on.
      expect(phaseAt("2026-09-13T23:00:00Z")).toBe("unreported");
      expect(phaseAt("2026-09-14T00:30:00Z")).toBe("unreported");
      expect(noStatsMessage(phaseAt("2026-09-13T22:00:00Z"), inLanguage("fr"))).toBe(
        "Le match n'a pas encore commencé : pas de statistiques à afficher.",
      );
    });

    test("from 2026-09-20 the day ends at midnight UTC, as Casablanca is UTC+0", () => {
      const placeholder = { status: "scheduled" as const, kickoff: "2026-09-27T00:00:00Z" };
      const phaseAt = (iso: string) => matchDataPhase(placeholder, Date.parse(iso));
      expect(phaseAt("2026-09-27T01:00:00Z")).toBe("upcoming");
      expect(phaseAt("2026-09-27T22:59:00Z")).toBe("upcoming");
      expect(phaseAt("2026-09-27T23:59:00Z")).toBe("upcoming");
      expect(phaseAt("2026-09-28T00:00:00Z")).toBe("unreported");
    });
    test("is awaited exactly while the page checks for it, a placeholder kick-off included", () => {
      // "This page updates itself" is only said while it does. A kick-off at
      // the provider's placeholder hour (midnight UTC) is not watched
      // (`matchRefetchInterval`), so its panels never say so.
      for (const placeholderOrNot of [kickoff, "2026-09-27T00:00:00Z"]) {
        const match = { status: "scheduled" as const, kickoff: placeholderOrNot };
        for (let offset = 0; offset <= 4 * 60; offset += 5) {
          const asOf = Date.parse(placeholderOrNot) + offset * 60_000;
          expect([placeholderOrNot, offset, matchDataPhase(match, asOf) === "awaiting"]).toEqual([
            placeholderOrNot,
            offset,
            matchRefetchInterval(match, asOf) !== false,
          ]);
        }
      }
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

  test("before kick-off, every panel says the match has not started, and promises nothing", () => {
    // Audit A02: "Les statistiques seront disponibles au coup d'envoi" was a
    // promise too — the provider sends some matches no statistics, events or
    // lineups at all. What is sure before kick-off is that the match has not
    // started; not that its data will follow.
    const promises = {
      fr: /seront|sera |coup d'envoi|pour le moment|pour l'instant|se met à jour|publiées|reçue/i,
      ar: /ستتوفر|ستظهر|سيتم|عند انطلاق|حتى الآن|تلقائي|لم يتم نشر|لم تصل/,
    };
    // What the three panels said before kick-off until then, each caught.
    const before = {
      fr: [
        "Les statistiques seront disponibles au coup d'envoi.",
        "Aucun fait marquant pour le moment.",
        "Les compositions ne sont pas encore publiées par la source officielle.",
      ],
      ar: [
        "ستتوفر الإحصائيات عند انطلاق المباراة.",
        "لا توجد أحداث بارزة حتى الآن.",
        "لم يتم نشر التشكيلات بعد من المصدر الرسمي.",
      ],
    };
    const notStarted = { fr: "Le match n'a pas encore commencé : ", ar: "لم تنطلق المباراة بعد: " };
    for (const lang of ["fr", "ar"] as const) {
      for (const line of before[lang]) expect(line).toMatch(promises[lang]);
      for (const message of Object.values(MESSAGES)) {
        const line = message("upcoming", inLanguage(lang));
        expect([line, line.startsWith(notStarted[lang])]).toEqual([line, true]);
        expect(line).not.toMatch(promises[lang]);
      }
    }
    expect(noStatsMessage("upcoming", inLanguage("fr"))).toBe(
      "Le match n'a pas encore commencé : pas de statistiques à afficher.",
    );
    expect(noStatsMessage("upcoming", inLanguage("ar"))).toBe(
      "لم تنطلق المباراة بعد: لا توجد إحصائيات لعرضها.",
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

describe("empty, unavailable and failed are three different things (batch 4)", () => {
  const phases: MatchDataPhase[] = [
    "upcoming",
    "awaiting",
    "live",
    "finished",
    "unreported",
    "postponed",
    "called_off",
  ];

  test("data still expected is an empty panel; data that will not come is an unavailable one", () => {
    expect(phases.filter((phase) => !isDataUnavailable(phase))).toEqual([
      "upcoming",
      "awaiting",
      "live",
    ]);
    expect(phases.filter(isDataUnavailable)).toEqual([
      "finished",
      "unreported",
      "postponed",
      "called_off",
    ]);
  });

  test("the panels draw the two differently, and neither offers a retry", () => {
    const expected = inFrench(<MatchDataState phase="upcoming" message="Pas encore" />);
    const unavailable = inFrench(<MatchDataState phase="finished" message="Indisponible" />);
    // A crossed-out glyph for the unavailable one, the inbox for the empty one.
    expect(unavailable).toContain("lucide-circle-slash");
    expect(unavailable).not.toContain("lucide-inbox");
    expect(expected).toContain("lucide-inbox");
    expect(expected).not.toContain("lucide-circle-slash");
    for (const html of [expected, unavailable]) {
      expect(html).not.toContain("<button");
      expect(html).not.toContain(dictionaries.fr["state.retry"]);
    }
  });

  test("a failed read is the only one with a retry, and it says what failed", () => {
    const failed = inFrench(
      <ErrorState message={dictionaries.fr["state.error_matches"]} onRetry={() => {}} />,
    );
    expect(failed).toContain(dictionaries.fr["state.retry"]);
    expect(failed).toContain("Impossible de charger les matchs");
    // Without a way to retry there is no button to press.
    expect(inFrench(<ErrorState />)).not.toContain("<button");
  });

  test("an empty day can lead on to what exists, and says nothing is wrong", () => {
    const html = inFrench(
      <EmptyState action={<a href="/matches?date=2026-10-01">Derniers résultats</a>}>
        Aucun match programmé à cette date.
      </EmptyState>,
    );
    expect(html).toContain('href="/matches?date=2026-10-01"');
    expect(html).not.toContain(dictionaries.fr["state.error"]);
  });

  test("the generic empty-content line is not what a football screen says", () => {
    const read = (file: string) => readFileSync(join(import.meta.dir, "../../..", file), "utf8");
    const home = read("src/routes/index.tsx");
    expect(home).toContain('t("home.upcoming_empty")');
    expect(home).toContain('t("home.mine_empty")');
    // What is left of it on Home is the news rail's (hidden at launch).
    expect(home.match(/t\("state\.empty"\)/g)).toHaveLength(1);
    expect(read("src/routes/matches.index.tsx")).not.toContain('t("state.empty")');
  });

  test("every new line exists in French and in Arabic", () => {
    for (const key of [
      "state.unavailable",
      "state.error_matches",
      "matches.empty.results",
      "home.upcoming_empty",
      "home.mine_empty",
      "home.results_link",
      "home.calendar_link",
      "standings.details_show",
      "standings.details_hide",
      "predictions.match.round_link",
    ] as const) {
      expect(dictionaries.fr[key]).toBeTruthy();
      expect(dictionaries.ar[key]).toMatch(/[؀-ۿ]/);
    }
  });
});
