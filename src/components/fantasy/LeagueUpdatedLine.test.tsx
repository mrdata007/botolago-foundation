import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";

import { dictionaries } from "@/i18n/dictionaries";
import { I18nProvider } from "@/i18n/provider";
import { moroccoDateTimeFormat } from "@/lib/morocco-time";
import { leagueFreshness } from "@/lib/league-freshness";
import { LeagueUpdatedLine } from "./LeagueUpdatedLine";

/**
 * Audit 2026-10-14, UX-010: the league's "Dernière mise à jour" was the time of
 * the RENDER (`new Date()`), so an unrelated re-render moved it and old
 * standings looked freshly updated. It now names a time that belongs to the
 * data, and nothing when there is none.
 */

const fr = dictionaries.fr;
const CALCULATED = Date.parse("2026-10-14T16:05:00Z");
const RETRIEVED = Date.parse("2026-10-14T17:30:00Z");

const long = (at: number) =>
  moroccoDateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(at));

const render = (props: Parameters<typeof LeagueUpdatedLine>[0]) =>
  renderToStaticMarkup(
    <I18nProvider>
      <LeagueUpdatedLine {...props} />
    </I18nProvider>,
  ).replace(/<!-- -->/g, "");

describe("leagueFreshness", () => {
  test("the standings' own calculation time wins, and it is the latest row's", () => {
    const rows = [
      { calculatedAt: "2026-10-14T15:00:00Z" },
      { calculatedAt: "2026-10-14T16:05:00Z" },
      { calculatedAt: "2026-10-14T14:00:00Z" },
    ];
    expect(leagueFreshness(rows, RETRIEVED)).toEqual({ kind: "calculated", at: CALCULATED });
  });

  test("without a calculation time it is the time the data was retrieved, said as such", () => {
    expect(leagueFreshness([{}, {}], RETRIEVED)).toEqual({ kind: "retrieved", at: RETRIEVED });
    expect(leagueFreshness([{ calculatedAt: "nope" }], RETRIEVED)).toEqual({
      kind: "retrieved",
      at: RETRIEVED,
    });
  });

  test("with neither it is unknown, not the clock", () => {
    expect(leagueFreshness([], 0)).toBeNull();
    expect(leagueFreshness([{}], 0)).toBeNull();
  });
});

describe("the league's last-updated line", () => {
  const realNow = Date.now;
  afterEach(() => {
    Date.now = realNow;
  });

  test("names when the standings were calculated, in Casablanca time", () => {
    const html = render({ standings: [{ calculatedAt: "2026-10-14T16:05:00Z" }], retrievedAt: 0 });
    expect(html).toContain(`${fr["fpl.last_updated"]}:`);
    expect(html).toContain(long(CALCULATED));
  });

  test("says retrieval time when that is all there is", () => {
    const html = render({ standings: [{}], retrievedAt: RETRIEVED });
    expect(html).toContain(`${fr["fpl.last_retrieved"]}:`);
    expect(html).not.toContain(`${fr["fpl.last_updated"]}:`);
    expect(html).toContain(long(RETRIEVED));
  });

  test("shows nothing when no time belongs to the data", () => {
    expect(render({ standings: [], retrievedAt: 0 })).toBe("");
  });

  test("does not move with the clock: the same data reads the same hours later", () => {
    const props = { standings: [{ calculatedAt: "2026-10-14T16:05:00Z" }], retrievedAt: RETRIEVED };
    Date.now = () => Date.parse("2026-10-14T16:10:00Z");
    const first = render(props);
    Date.now = () => Date.parse("2026-10-15T09:00:00Z");
    expect(render(props)).toBe(first);
    const retrievedOnly = { standings: [{}], retrievedAt: RETRIEVED };
    const before = render(retrievedOnly);
    Date.now = () => Date.parse("2026-10-16T09:00:00Z");
    expect(render(retrievedOnly)).toBe(before);
  });

  test("the league screen no longer formats the render clock", () => {
    const source = readFileSync("src/routes/fantasy.leagues.$leagueId.tsx", "utf8");
    expect(source).not.toMatch(/\.format\(\s*new Date\(\s*\)\s*\)/);
    expect(source).toContain("<LeagueUpdatedLine");
  });

  test("both languages word the retrieval label", () => {
    expect(fr["fpl.last_retrieved"]).toBeTruthy();
    expect(dictionaries.ar["fpl.last_retrieved"]).toMatch(/[؀-ۿ]/);
  });
});
