import { describe, expect, it } from "bun:test";
import { formatFullDate, formatRelativeTime } from "./format-time";

describe("Moroccan-locale date/time formatting", () => {
  it("formats the full date for ar with Western (latn) digits only", () => {
    const formatted = formatFullDate("2026-09-18T14:30:00Z", "ar");
    expect(formatted).not.toBe("");
    expect(formatted).toMatch(/^[^٠-٩]*$/);
  });

  it("formats the full date for fr matching fr-FR Intl output, in Morocco's zone", () => {
    // Before 2026-09-20, when every tz release agrees on Morocco (UTC+1 then),
    // so asking Intl for the zone is a fair reference. It used to ask for no
    // zone at all, which pinned the test process's own clock instead.
    const iso = "2026-09-18T14:30:00Z";
    const expected = new Intl.DateTimeFormat("fr-FR", {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Africa/Casablanca",
    }).format(new Date(iso));
    expect(expected).toBe("18 septembre 2026 à 15:30");
    expect(formatFullDate(iso, "fr")).toBe(expected);
  });

  it("formats relative time for ar with Western (latn) digits only", () => {
    const now = Date.now();
    const fiveMinAgo = new Date(now - 5 * 60 * 1000).toISOString();
    const formatted = formatRelativeTime(fiveMinAgo, "ar");
    expect(formatted).not.toBe("");
    expect(formatted).toMatch(/^[^٠-٩]*$/);
  });
});

/**
 * The news pages' dates are Morocco's, whatever zone renders them.
 *
 * The server renders in UTC and a reader's browser in its own zone. A
 * formatter without a zone printed "22 sept." on one and "23 sept." on the
 * other for an article published at 23:30 UTC, and React threw "Hydration
 * failed" on /news. Each zone runs in its own process: `TZ` is read once, at
 * startup (see `match-day.timezone.test.ts`).
 */
function newsDatesInZone(zone: string, iso: string): Record<string, string> {
  const formatTime = new URL("./format-time.ts", import.meta.url).pathname;
  const newsData = new URL("../components/news/news-data.ts", import.meta.url).pathname;
  const script = `
    import { formatFullDate } from ${JSON.stringify(formatTime)};
    import { formatArticleDate } from ${JSON.stringify(newsData)};
    const iso = ${JSON.stringify(iso)};
    const zoneless = new Intl.DateTimeFormat("fr-FR", { day: "numeric" }).format(new Date(iso));
    process.stdout.write(JSON.stringify({
      zoneless,
      articleFr: formatArticleDate(iso, "fr"),
      articleAr: formatArticleDate(iso, "ar"),
      fullFr: formatFullDate(iso, "fr"),
    }));
  `;
  const proc = Bun.spawnSync(["bun", "-e", script], { env: { ...process.env, TZ: zone } });
  if (!proc.success) throw new Error(`child failed in ${zone}: ${proc.stderr.toString()}`);
  return JSON.parse(proc.stdout.toString()) as Record<string, string>;
}

describe("news dates are on the Morocco clock", () => {
  // 23:30 UTC on 22 September 2026: 23:30 in Morocco (UTC+0 from 20 September),
  // already the 23rd in Paris (UTC+2) and in a browser whose data still says UTC+1.
  const LATE_EVENING = "2026-09-22T23:30:00Z";

  it("prints the Moroccan day for a late-evening article, in every zone", () => {
    const zones = ["UTC", "Africa/Casablanca", "Europe/Paris", "Asia/Tokyo"];
    const results = zones.map((zone) => newsDatesInZone(zone, LATE_EVENING));
    // Not a no-op: away from UTC, a formatter with no zone gives the 23rd.
    expect(results.find((_, i) => zones[i] === "Europe/Paris")!.zoneless).toBe("23");
    for (const [i, zone] of zones.entries()) {
      const { zoneless: _zoneless, ...dates } = results[i]!;
      expect({ zone, ...dates }).toEqual({
        zone,
        articleFr: "22 sept. 2026",
        articleAr: formatArticleDateInUtc(LATE_EVENING),
        fullFr: "22 septembre 2026 à 23:30",
      });
    }
  });

  it("keeps the old UTC+1 day for an article from before Morocco's clock change", () => {
    // 23:30 UTC on 12 September was 00:30 on the 13th in Morocco (UTC+1 then).
    expect(newsDatesInZone("UTC", "2026-09-12T23:30:00Z").articleFr).toBe("13 sept. 2026");
  });
});

/** The Arabic date as Morocco shows it after the change: the same as UTC's. */
function formatArticleDateInUtc(iso: string): string {
  return new Intl.DateTimeFormat("ar-MA", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(iso));
}
