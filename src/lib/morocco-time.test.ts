import { describe, expect, test } from "bun:test";

import * as edge from "../../supabase/functions/_shared/morocco-time";
import {
  MOROCCO_PERMANENT_UTC_FROM_MS,
  moroccoDateTimeFormat,
  moroccoOffsetMs,
  moroccoParts,
  moroccoWallToInstant,
} from "./morocco-time";

const HOUR = 3_600_000;
const at = (iso: string) => Date.parse(iso);

/** Does this runtime already know Morocco is UTC+0 from 2026-09-20? */
const runtimeKnowsTheChange =
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Casablanca",
    hour: "2-digit",
    hourCycle: "h23",
  }).format(new Date("2026-10-02T16:00:00Z")) === "16";

describe("Morocco's offset", () => {
  test("is UTC+1 outside Ramadan and UTC+0 during it, before the change", () => {
    expect(moroccoOffsetMs(at("2026-01-15T12:00:00Z"))).toBe(HOUR);
    expect(moroccoOffsetMs(at("2026-02-14T12:00:00Z"))).toBe(HOUR);
    expect(moroccoOffsetMs(at("2026-02-16T12:00:00Z"))).toBe(0);
    expect(moroccoOffsetMs(at("2026-03-22T12:00:00Z"))).toBe(HOUR);
    expect(moroccoOffsetMs(at("2026-09-19T12:00:00Z"))).toBe(HOUR);
    expect(moroccoOffsetMs(at("2026-09-20T00:59:59Z"))).toBe(HOUR);
  });

  test("is UTC+0 from 2026-09-20T01:00:00Z, and stays there", () => {
    expect(MOROCCO_PERMANENT_UTC_FROM_MS).toBe(at("2026-09-20T01:00:00Z"));
    for (const iso of [
      "2026-09-20T01:00:00Z",
      "2026-09-20T02:00:00Z",
      "2026-10-02T16:00:00Z",
      "2027-02-10T12:00:00Z", // Ramadan 2027
      "2027-07-01T12:00:00Z",
      "2030-06-01T12:00:00Z",
      "2035-02-10T12:00:00Z",
    ]) {
      expect(moroccoOffsetMs(at(iso))).toBe(0);
    }
  });

  test("does not depend on what this runtime's time-zone data says after the change", () => {
    // On a runtime that already knows the change, Intl agrees; on an older one it
    // says UTC+1 and the helper still says UTC+0. Either way the helper's answer
    // is the same.
    const wall = moroccoParts(new Date("2026-10-02T16:00:00Z"));
    expect(wall).toMatchObject({ year: 2026, month: 10, day: 2, hour: 16, minute: 0 });
    if (runtimeKnowsTheChange) {
      const intl = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Africa/Casablanca",
        hour: "2-digit",
        hourCycle: "h23",
      }).format(new Date("2026-10-02T16:00:00Z"));
      expect(intl).toBe("16");
    }
  });
});

describe("the wall clock", () => {
  test("reads the fields Morocco shows", () => {
    expect(moroccoParts(new Date("2026-09-12T23:30:00Z"))).toMatchObject({
      day: 13,
      hour: 0,
      minute: 30,
    });
    expect(moroccoParts(new Date("2026-09-25T23:30:00Z"))).toMatchObject({
      day: 25,
      hour: 23,
      minute: 30,
    });
  });

  test("turns a wall time back into an instant, either side of the change", () => {
    expect(moroccoWallToInstant(2026, 9, 12, 20, 0).toISOString()).toBe("2026-09-12T19:00:00.000Z");
    expect(moroccoWallToInstant(2026, 10, 12, 20, 0).toISOString()).toBe(
      "2026-10-12T20:00:00.000Z",
    );
    expect(moroccoWallToInstant(2027, 2, 22, 20, 0).toISOString()).toBe("2027-02-22T20:00:00.000Z");
    expect(moroccoWallToInstant(2026, 3, 1, 20, 0).toISOString()).toBe("2026-03-01T20:00:00.000Z");
  });

  test("round-trips a grid of instants", () => {
    for (
      let ms = at("2026-01-01T00:00:00Z");
      ms < at("2027-06-01T00:00:00Z");
      ms += 7 * 3_600_000
    ) {
      const p = moroccoParts(new Date(ms));
      const back = moroccoWallToInstant(p.year, p.month, p.day, p.hour, p.minute, p.second);
      // The repeated hour at the change cannot round-trip to both instants; elsewhere it must.
      if (Math.abs(ms - MOROCCO_PERMANENT_UTC_FROM_MS) > 3 * HOUR) expect(back.getTime()).toBe(ms);
    }
  });
});

describe("the formatter", () => {
  const time = moroccoDateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });

  test("prints Morocco's clock whatever the runtime's data says", () => {
    expect(time.format(new Date("2026-09-12T19:00:00Z"))).toBe("20:00"); // UTC+1
    expect(time.format(new Date("2026-10-02T16:00:00Z"))).toBe("16:00"); // UTC+0
    expect(time.format(new Date("2027-02-10T16:00:00Z"))).toBe("16:00"); // Ramadan 2027
    expect(time.format(at("2026-09-20T00:59:00Z"))).toBe("01:59");
    expect(time.format(at("2026-09-20T01:00:00Z"))).toBe("01:00");
  });

  test("gives the day a kickoff is on, in both languages", () => {
    const day = (locale: string, iso: string) =>
      moroccoDateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long" }).format(
        new Date(iso),
      );
    expect(day("fr-FR", "2026-09-25T23:30:00Z")).toBe("vendredi 25 septembre");
    expect(day("fr-FR", "2026-09-12T23:30:00Z")).toBe("dimanche 13 septembre");
    expect(day("ar-MA", "2026-09-25T23:30:00Z")).toContain("25");
  });

  test("accepts a number, formatToParts and formatRange like the original", () => {
    const parts = time.formatToParts(at("2026-10-02T16:05:00Z"));
    expect(parts.filter((p) => p.type !== "literal").map((p) => p.value)).toEqual(["16", "05"]);
    expect(time.format(at("2026-10-02T16:00:00Z"))).toBe("16:00");
    const range = moroccoDateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });
    expect(range.formatRange(at("2026-10-02T16:00:00Z"), at("2026-10-02T18:00:00Z"))).toContain(
      "16:00",
    );
  });

  test("refuses a zone or a zone name, and raises for an invalid date as Intl does", () => {
    expect(() => moroccoDateTimeFormat("fr-FR", { timeZone: "UTC" } as never)).toThrow(TypeError);
    expect(() => moroccoDateTimeFormat("fr-FR", { timeZoneName: "short" } as never)).toThrow(
      TypeError,
    );
    expect(() => time.format(new Date("not a date"))).toThrow(RangeError);
  });
});

describe("the email renderer's copy of the rule", () => {
  test("agrees with this one on a grid of instants either side of the change", () => {
    for (
      let ms = at("2025-12-01T00:00:00Z");
      ms < at("2028-01-01T00:00:00Z");
      ms += 5 * 3_600_000
    ) {
      expect(edge.moroccoOffsetMs(ms)).toBe(moroccoOffsetMs(ms));
      const shifted = edge.shiftToMorocco(new Date(ms)).getTime();
      expect(shifted).toBe(ms + moroccoOffsetMs(ms));
    }
    expect(edge.MOROCCO_PERMANENT_UTC_FROM_MS).toBe(MOROCCO_PERMANENT_UTC_FROM_MS);
  });
});
