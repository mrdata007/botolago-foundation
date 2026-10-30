import { beforeAll, describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { fill } from "@/components/manager-card/interpolate";
import { dictionaries } from "@/i18n/dictionaries";
import { loadFrSection } from "@/i18n/fr-sections";
import { I18nProvider } from "@/i18n/provider";
import { publicationNoticeOf } from "@/services/fantasy-publication-notice";
import { fantasyGameweekSchema } from "@/backend/fantasy/contracts";

import { PublicationNoticeLine } from "./PublicationNoticeLine";
import { formatPublicationMoment } from "./publication-notice";

/**
 * A journée's points are published all at once (migration 20261030100000):
 * until then the Fantasy screens say «Points de la Journée 6 : samedi 31 oct. à
 * 14h», in Morocco's time, in French and in Arabic.
 */

// Saturday 31 October 2026, 14:00 in Morocco (UTC+0 since 2026-09-20).
const SATURDAY_14H = "2026-10-31T14:00:00Z";

describe("how the moment reads", () => {
  test("French: the day and the hour, in Morocco's time", () => {
    expect(formatPublicationMoment("fr", SATURDAY_14H)).toEqual({
      day: "samedi 31 oct.",
      time: "14h",
    });
  });

  test("French: minutes are kept when there are some", () => {
    expect(formatPublicationMoment("fr", "2026-11-01T14:30:00Z").time).toBe("14h30");
  });

  test("Arabic: the day name, the date and a 24-hour clock with Latin digits", () => {
    const { day, time } = formatPublicationMoment("ar", SATURDAY_14H);
    expect(day).toContain("السبت");
    expect(day).toContain("31");
    expect(day).toContain("أكتوبر");
    expect(time).toBe("14:00");
  });

  test("the hour is Morocco's whatever the viewer's own clock says", () => {
    // 23:30 UTC on Friday is already Saturday 00:30 for a viewer in Paris (UTC+1 at that date was
    // CET), but Morocco is UTC+0: it is still Friday 23:30 there.
    const late = "2026-10-30T23:30:00Z";
    expect(formatPublicationMoment("fr", late)).toEqual({ day: "vendredi 30 oct.", time: "23h30" });
  });
});

describe("the sentence", () => {
  // The French Fantasy strings are a section the /fantasy pages load.
  beforeAll(() => loadFrSection("fantasy"));

  const render = () =>
    renderToStaticMarkup(
      <I18nProvider>
        <PublicationNoticeLine notice={{ gameweek: 6, publishAt: SATURDAY_14H }} />
      </I18nProvider>,
    ).replace(/<!-- -->/g, "");

  test("French reads «Points de la Journée 6 : samedi 31 oct. à 14h»", () => {
    expect(render()).toContain("Points de la Journée 6 : samedi 31 oct. à 14h");
  });

  test("it is a status line in the muted note style, with no new styling", () => {
    const html = render();
    expect(html).toContain('role="status"');
    expect(html).not.toContain("style=");
  });

  test("Arabic reads the same fact, with the hour isolated left to right", () => {
    const { day, time } = formatPublicationMoment("ar", SATURDAY_14H);
    const arabic = dictionaries.ar["fantasy.points.publish_at"] as string;
    expect(arabic).toBe("نقاط الجولة {n}: {day} على الساعة {time}");
    const html = renderToStaticMarkup(<>{fill(arabic, { n: 6, day, time })}</>).replace(
      /<!-- -->/g,
      "",
    );
    expect(html).toContain("نقاط الجولة ");
    expect(html).toContain('<bdi dir="ltr">6</bdi>');
    expect(html).toContain('<bdi dir="ltr">14:00</bdi>');
    expect(html).toContain("السبت");
  });

  test("both languages have the sentence", () => {
    expect(dictionaries.fr["fantasy.points.publish_at"]).toContain("{n}");
    expect(dictionaries.ar["fantasy.points.publish_at"]).toContain("{n}");
  });
});

describe("which journée the notice is about", () => {
  const items = [
    { sequence: 5, publicationHeld: false, publishAt: null },
    { sequence: 6, publicationHeld: true, publishAt: SATURDAY_14H },
    { sequence: 7, publicationHeld: true, publishAt: "2026-11-07T14:00:00Z" },
    { sequence: 8, publicationHeld: true, publishAt: null },
  ];

  test("with a journée: its own moment", () => {
    expect(publicationNoticeOf(items, 7)).toEqual({
      gameweek: 7,
      publishAt: "2026-11-07T14:00:00Z",
    });
  });

  test("without one: the oldest journée still waiting", () => {
    expect(publicationNoticeOf(items, null)).toEqual({ gameweek: 6, publishAt: SATURDAY_14H });
  });

  test("a published journée, an unknown moment and a database that does not say show nothing", () => {
    expect(publicationNoticeOf(items, 5)).toBeNull();
    expect(publicationNoticeOf(items, 8)).toBeNull();
    expect(publicationNoticeOf([{ sequence: 1 }, { sequence: 2 }], null)).toBeNull();
    expect(publicationNoticeOf(undefined, null)).toBeNull();
    expect(
      publicationNoticeOf([{ sequence: 6, publicationHeld: true, publishAt: "not a date" }], 6),
    ).toBeNull();
  });
});

describe("the gameweek contract", () => {
  const base = {
    id: "00000000-0000-4000-8000-000000000001",
    sequence: 6,
    name: "Journée 6",
    deadlineAt: "2026-11-07T10:00:00Z",
    startsAt: "2026-11-07T12:00:00Z",
    endsAt: "2026-11-08T12:00:00Z",
    status: "provisional",
    pointsState: "provisional",
  };

  test("carries the publication fields", () => {
    const parsed = fantasyGameweekSchema.parse({
      ...base,
      publicationHeld: true,
      publishAt: SATURDAY_14H,
    });
    expect(parsed.publicationHeld).toBe(true);
    expect(parsed.publishAt).toBe(SATURDAY_14H);
  });

  test("a database that predates the migration still parses", () => {
    const parsed = fantasyGameweekSchema.parse(base);
    expect(parsed.publicationHeld).toBeUndefined();
    expect(parsed.publishAt).toBeUndefined();
  });

  test("a held journée whose moment is not known yet parses", () => {
    expect(
      fantasyGameweekSchema.parse({ ...base, publicationHeld: true, publishAt: null }).publishAt,
    ).toBeNull();
  });
});
