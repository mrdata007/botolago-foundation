import { describe, expect, test } from "bun:test";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { dictionaries } from "@/i18n/dictionaries";
import { I18nProvider } from "@/i18n/provider";
import { clubMatchPalettes } from "@/lib/club-palette";
import { moroccoDateTimeFormat } from "@/lib/morocco-time";
import type { Club, Match } from "@/types/domain";
import { LiveFreshnessNote } from "./LiveFreshnessNote";
import { MatchScoreHeader } from "./MatchScoreHeader";
import { MatchTopBar } from "./MatchTopBar";
import { RETURN_EVENTS, watchReturns } from "./use-live-freshness";

/**
 * The live match page says how old its read is and stops claiming "live" on
 * a read it cannot trust (docs/screens/2026-10-14-live-match-freshness/BRIEF.md).
 */

const inFrench = (node: ReactElement) =>
  renderToStaticMarkup(<I18nProvider>{node}</I18nProvider>).replace(/<!-- -->/g, "");

const UPDATED = Date.parse("2026-10-13T20:05:00Z");
// In Casablanca time, as the page writes every time (21:05 with Morocco's +01).
const TIME = moroccoDateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(
  new Date(UPDATED),
);

describe("LiveFreshnessNote", () => {
  const note = (freshness: "fresh" | "stale" | "expired" | "not_live", refreshing = false) =>
    inFrench(
      <LiveFreshnessNote
        freshness={freshness}
        updatedAt={UPDATED}
        refreshing={refreshing}
        onRefresh={() => {}}
      />,
    );

  test("fresh: one quiet line with the time, not a live region", () => {
    const html = note("fresh");
    expect(html).toContain('data-freshness="fresh"');
    expect(html).toMatch(new RegExp(`Mis à jour à <bdi[^>]*>${TIME}</bdi>`));
    expect(html).not.toContain('role="status"');
    expect(html).not.toContain("<button");
  });

  test("stale: says since when, announced once, with a refresh button", () => {
    const html = note("stale");
    expect(html).toContain('role="status"');
    expect(html).toMatch(new RegExp(`Score non actualisé depuis <bdi[^>]*>${TIME}</bdi>\\.`));
    expect(html).toMatch(/<button type="button"[^>]*>.*Actualiser<\/button>/);
    expect(html).not.toContain('disabled=""');
  });

  test("expired: says the score may not be final", () => {
    expect(note("expired")).toMatch(
      new RegExp(
        `Dernière mise à jour à <bdi[^>]*>${TIME}</bdi>\\. Ce score n(?:'|&#x27;)est peut-être pas définitif\\.`,
      ),
    );
  });

  test("while a refresh runs, the button waits", () => {
    expect(note("stale", true)).toMatch(/<button[^>]*disabled=""[^>]*aria-busy="true"/);
  });

  test("not live: nothing at all", () => {
    expect(note("not_live")).toBe("");
  });

  test("the Arabic copy is Arabic and keeps the {time} slot", () => {
    for (const key of [
      "matches.detail.updated_at",
      "matches.detail.stale_since",
      "matches.detail.stale_expired",
    ] as const) {
      expect(dictionaries.ar[key]).toMatch(/[؀-ۿ]/);
      expect(dictionaries.ar[key]).toContain("{time}");
      expect(dictionaries.fr[key]).toContain("{time}");
    }
    expect(dictionaries.ar["matches.detail.refresh"]).toMatch(/[؀-ۿ]/);
    expect(dictionaries.ar["matches.status.unconfirmed"]).toMatch(/[؀-ۿ]/);
  });
});

const club = (id: string, name: string): Club => ({
  id,
  slug: id,
  name: { fr: name, ar: name },
  shortName: { fr: name, ar: name },
  city: { fr: "Rabat", ar: "Rabat" },
  primaryColor: "var(--ui-ink)",
  crestPlaceholder: id.toUpperCase(),
});
const fus = club("fus", "FUS");
const raja = club("rca", "Raja");
const palettes = clubMatchPalettes(fus, raja);
const live: Match = {
  id: "m1",
  gameweek: 4,
  homeClubId: "fus",
  awayClubId: "rca",
  kickoff: "2026-10-13T20:00:00.000Z",
  status: "live",
  minute: 25,
  homeScore: 0,
  awayScore: 1,
  venue: { fr: "Stade", ar: "Stade" },
};

describe("the score header on a read too old to trust", () => {
  const header = (liveUnconfirmed?: boolean) =>
    inFrench(
      <MatchScoreHeader
        match={live}
        home={fus}
        away={raja}
        palettes={palettes}
        elapsed={25}
        headingId="h"
        liveUnconfirmed={liveUnconfirmed}
      />,
    );

  test("a trusted live read keeps the live pill, the live region and the elapsed bar", () => {
    const html = header();
    expect(html).toContain("En direct");
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("bg-[color:var(--ui-live)] transition-[width]");
    expect(html).not.toContain("Score à confirmer");
  });

  test("an expired one keeps the score but shows the neutral pill, no live claim, no bar", () => {
    const html = header(true);
    expect(html).toContain("Score à confirmer");
    expect(html).toContain("Score : FUS 0, Raja 1");
    expect(html).not.toContain("En direct");
    expect(html).not.toContain('aria-live="polite"');
    expect(html).not.toContain("transition-[width]");
  });

  test("the compact bar follows", () => {
    const bar = (liveUnconfirmed: boolean) =>
      inFrench(
        <MatchTopBar
          onBack={() => {}}
          compact
          fixture={{ match: live, home: fus, away: raja, palettes, elapsed: 25, liveUnconfirmed }}
        />,
      );
    expect(bar(false)).toContain("En direct");
    expect(bar(true)).toContain("Score à confirmer");
    expect(bar(true)).not.toContain("En direct");
  });
});

describe("watchReturns", () => {
  test("every way back to the page calls once; a hidden page does not; stopping stops", () => {
    const win = new EventTarget();
    const doc = Object.assign(new EventTarget(), { visibilityState: "visible" });
    let calls = 0;
    const stop = watchReturns(win, doc, () => {
      calls += 1;
    });
    for (const name of RETURN_EVENTS.window) win.dispatchEvent(new Event(name));
    doc.dispatchEvent(new Event("visibilitychange"));
    expect(calls).toBe(4);
    doc.visibilityState = "hidden";
    doc.dispatchEvent(new Event("visibilitychange"));
    expect(calls).toBe(4);
    doc.visibilityState = "visible";
    stop();
    win.dispatchEvent(new Event("pageshow"));
    win.dispatchEvent(new Event("online"));
    expect(calls).toBe(4);
  });

  test("pageshow (back/forward cache) is among them: React Query does not hear it", () => {
    expect(RETURN_EVENTS.window).toContain("pageshow");
    expect(RETURN_EVENTS.window).toContain("online");
    expect(RETURN_EVENTS.document).toContain("visibilitychange");
  });
});
