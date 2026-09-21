import { describe, expect, it } from "bun:test";

import {
  addMatchDays,
  isSameMatchDay,
  matchDayFromKey,
  matchDayKey,
  MATCH_TIME_ZONE,
  startOfMatchDay,
} from "./match-kickoff";

/**
 * BG-0100 — match days belong to the competition, not to the viewer.
 *
 * A test that only ever runs in one zone proves nothing here: in UTC the
 * broken local-calendar arithmetic and the correct competition-calendar
 * arithmetic agree for most kickoffs, so the defect passes unnoticed. The
 * zone is fixed per process (`TZ` is read once, at startup — reassigning
 * `process.env.TZ` mid-run does not move the local calendar), so the only
 * honest way to exercise a viewer in Los Angeles is to run the assertions in
 * a process launched there. That is what `inZone` does.
 */
function inZone(zone: string, body: string): unknown {
  const script = `
    import {
      addMatchDays, isSameMatchDay, matchDayFromKey, matchDayKey, startOfMatchDay,
    } from ${JSON.stringify(new URL("./match-kickoff.ts", import.meta.url).pathname)};
    const localDayOf = (d) =>
      d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") +
      "-" + String(d.getDate()).padStart(2, "0");
    const out = (() => { ${body} })();
    process.stdout.write(JSON.stringify(out));
  `;
  const proc = Bun.spawnSync(["bun", "-e", script], {
    env: { ...process.env, TZ: zone },
  });
  if (!proc.success) {
    throw new Error(`child failed in ${zone}: ${proc.stderr.toString()}`);
  }
  return JSON.parse(proc.stdout.toString());
}

/** 20:00 in Casablanca on 24 Sep 2026 — an ordinary evening kickoff. */
const EVENING_KICKOFF = "2026-09-24T20:00:00+01:00";
/** The provider's UTC-midnight placeholder for an unconfirmed hour. */
const PLACEHOLDER_KICKOFF = "2026-09-24T00:00:00Z";

const VIEWER_ZONES = [
  "UTC",
  "America/Los_Angeles", // UTC−7: an evening kickoff is still the same afternoon
  "America/Sao_Paulo", // UTC−3
  "Asia/Tokyo", // UTC+9: an evening kickoff is the next morning
  "Pacific/Auckland", // UTC+12/+13: furthest ahead
];

describe("BG-0100: the competition calendar is the same for every viewer", () => {
  it("is not a no-op — a browser-local day really does disagree with the competition day", () => {
    // If this ever stops being true the rest of the file has stopped testing
    // anything, because the broken and the correct answer would coincide.
    const local = inZone(
      "Pacific/Auckland",
      `
      return localDayOf(new Date(${JSON.stringify(EVENING_KICKOFF)}));
    `,
    );
    expect(local).toBe("2026-09-25");
    expect(matchDayKey(new Date(EVENING_KICKOFF))).toBe("2026-09-24");
  });

  for (const zone of VIEWER_ZONES) {
    it(`files the evening kickoff on 2026-09-24 for a viewer in ${zone}`, () => {
      const seen = inZone(
        zone,
        `
        const kickoff = new Date(${JSON.stringify(EVENING_KICKOFF)});
        return {
          key: matchDayKey(kickoff),
          sameAsSelected: isSameMatchDay(kickoff, matchDayFromKey("2026-09-24")),
          sameAsNeighbour: isSameMatchDay(kickoff, matchDayFromKey("2026-09-25")),
          startKey: matchDayKey(startOfMatchDay(kickoff)),
          nextKey: matchDayKey(addMatchDays(kickoff, 1)),
          prevKey: matchDayKey(addMatchDays(kickoff, -1)),
        };
      `,
      );
      expect(seen).toEqual({
        key: "2026-09-24",
        sameAsSelected: true,
        sameAsNeighbour: false,
        startKey: "2026-09-24",
        nextKey: "2026-09-25",
        prevKey: "2026-09-23",
      });
    });

    it(`files the unconfirmed-hour placeholder on 2026-09-24 for a viewer in ${zone}`, () => {
      // 00:00Z is 01:00 in Casablanca, i.e. still the 24th there, but it is
      // the 23rd for every viewer west of Greenwich.
      const seen = inZone(
        zone,
        `
        return matchDayKey(new Date(${JSON.stringify(PLACEHOLDER_KICKOFF)}));
      `,
      );
      expect(seen).toBe("2026-09-24");
    });
  }

  it("groups a fixture list into the same days regardless of the viewer's zone", () => {
    const fixtures = [
      "2026-09-24T14:00:00+01:00",
      "2026-09-24T20:00:00+01:00",
      "2026-09-24T23:30:00+01:00",
      "2026-09-25T00:30:00+01:00",
      "2026-09-25T18:00:00+01:00",
    ];
    const grouped = VIEWER_ZONES.map((zone) =>
      inZone(
        zone,
        `
        const fixtures = ${JSON.stringify(fixtures)};
        const out = {};
        for (const f of fixtures) {
          const k = matchDayKey(new Date(f));
          (out[k] ??= []).push(f);
        }
        return out;
      `,
      ),
    );
    const expected = {
      "2026-09-24": fixtures.slice(0, 3),
      "2026-09-25": fixtures.slice(3),
    };
    for (const g of grouped) expect(g).toEqual(expected);
  });

  it("walks the strip by calendar days, not by 24-hour steps", () => {
    // Morocco drops to UTC+00:00 for Ramadan and returns afterwards, so one
    // of these days is 23 or 25 hours long. Adding milliseconds would drift;
    // adding calendar days does not.
    let cursor = matchDayFromKey("2026-02-13");
    const walked: string[] = [];
    for (let i = 0; i < 40; i += 1) {
      walked.push(matchDayKey(cursor));
      cursor = addMatchDays(cursor, 1);
    }
    expect(new Set(walked).size).toBe(40);
    expect(walked[0]).toBe("2026-02-13");
    expect(walked.at(-1)).toBe("2026-03-24");
    // Every entry is that day's own midnight in the competition zone.
    for (const key of walked) {
      expect(matchDayKey(startOfMatchDay(matchDayFromKey(key)))).toBe(key);
    }
  });

  it("pins the competition zone, not a fixed +01:00 offset", () => {
    expect(MATCH_TIME_ZONE).toBe("Africa/Casablanca");
  });
});
