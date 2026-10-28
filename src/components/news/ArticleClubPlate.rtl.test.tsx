import { afterAll, describe, expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import type { Club } from "@/types/domain";

/**
 * The thumbnail follows the match header's convention (`MatchScoreHeader`):
 * HOME is the first thing in the DOM, in a container that inherits the page
 * direction, with its own score beside it. Nothing here sets a direction or
 * reverses a row, so in Arabic (RTL) home sits on the right and an away win,
 * 0-1, reads visually as "1 - 0" with the away crest on the left.
 *
 * Layout cannot be measured under SSR, so this pins the two things the
 * convention rests on: the DOM order, and the absence of anything that would
 * override the inherited direction. The geometry is measured in a browser (the
 * lane's Playwright check: home crest right of the away crest in `dir="rtl"`).
 */
const realI18n = { ...(await import("@/i18n/provider")) };
mock.module("@/i18n/provider", () => ({
  ...realI18n,
  useI18n: () => ({
    lang: "ar" as const,
    dir: "rtl" as const,
    t: (key: string) => key,
    tr: (value: { ar: string }) => value.ar,
  }),
}));
afterAll(() => {
  mock.module("@/i18n/provider", () => realI18n);
});

const { ArticleClubPlate } = await import("./ArticleClubPlate");

const club = (id: string, name: string): Club => ({
  id,
  slug: id,
  name: { fr: name, ar: name },
  shortName: { fr: name, ar: name },
  city: { fr: "", ar: "" },
  primaryColor: "",
  crestPlaceholder: id.toUpperCase(),
});

const home = club("hom", "Home");
const away = club("awa", "Away");
const fixture = {
  kind: "result" as const,
  homeClubId: "hom",
  awayClubId: "awa",
  kickoff: "2026-10-24T18:00:00Z",
  homeScore: 0,
  awayScore: 1,
};

describe.each(["thumb", "card", "hero"] as const)("the %s plate, home first", (size) => {
  const html = renderToStaticMarkup(
    <div dir="rtl">
      <ArticleClubPlate clubs={[home, away]} fixture={fixture} size={size} />
    </div>,
  );

  test("home crest, home score, away score, away crest, in that DOM order", () => {
    const homeAt = html.indexOf("HOM");
    const awayAt = html.indexOf("AWA");
    const zero = html.indexOf("<bdi>0</bdi>");
    const one = html.indexOf("<bdi>1</bdi>");
    expect(homeAt).toBeGreaterThan(-1);
    expect(awayAt).toBeGreaterThan(-1);
    expect(zero).toBeGreaterThan(-1);
    expect(one).toBeGreaterThan(zero);
    // Home's crest is before the score, away's after it.
    expect(homeAt).toBeLessThan(zero);
    expect(awayAt).toBeGreaterThan(one);
  });

  test("nothing forces a direction or reverses the row", () => {
    expect(html).not.toMatch(/\bdir="ltr"/);
    expect(html).not.toMatch(/flex-row-reverse|rtl:flex-row-reverse|direction:/);
    // A physical left/right offset would not mirror.
    expect(html).not.toMatch(/(?:^|[\s"])-?(?:left|right|ml|mr|pl|pr)-/);
  });
});
