import { describe, expect, it } from "bun:test";

import { dictionaries } from "@/i18n/dictionaries";
import { clockNow, CLOCK_TICK_MS } from "./use-clock";
import { kickoffClock, kickoffDay, pluralForm } from "./kickoff-countdown";

describe("pluralForm: the Arabic countdown reads in words, agreed with the figure", () => {
  const ar = dictionaries.ar;
  const fr = dictionaries.fr;
  const say = (key: "unit_day" | "unit_hour" | "unit_minute", n: number, lang: "ar" | "fr") =>
    pluralForm(dictionaries[lang][`home.kickoff.${key}`], n, lang).replace("{n}", String(n));

  it("names one and two by their own form, with no figure", () => {
    expect(say("unit_minute", 1, "ar")).toBe("دقيقة");
    expect(say("unit_minute", 2, "ar")).toBe("دقيقتان");
    expect(say("unit_hour", 1, "ar")).toBe("ساعة");
    expect(say("unit_hour", 2, "ar")).toBe("ساعتان");
    expect(say("unit_day", 1, "ar")).toBe("يوم");
    expect(say("unit_day", 2, "ar")).toBe("يومان");
  });

  it("uses the plural for three to ten and the singular after the figure from eleven", () => {
    expect(say("unit_minute", 3, "ar")).toBe("3 دقائق");
    expect(say("unit_minute", 10, "ar")).toBe("10 دقائق");
    expect(say("unit_minute", 11, "ar")).toBe("11 دقيقة");
    expect(say("unit_minute", 58, "ar")).toBe("58 دقيقة");
    expect(say("unit_hour", 5, "ar")).toBe("5 ساعات");
    expect(say("unit_hour", 23, "ar")).toBe("23 ساعة");
    expect(say("unit_day", 4, "ar")).toBe("4 أيام");
    expect(say("unit_day", 12, "ar")).toBe("12 يومًا");
  });

  it("has no one-letter abbreviation left in the Arabic countdown", () => {
    const text = Object.entries(ar)
      .filter(([key]) => key.startsWith("home.kickoff."))
      .map(([, value]) => value)
      .join(" ");
    expect(text).not.toMatch(/(^|\s)[يسد](\s|$)/);
  });

  it("joins days and hours, and hours and minutes, with و", () => {
    expect(ar["home.kickoff.in_days"]).toBe("{d} و{h}");
    expect(ar["home.kickoff.in_hours"]).toBe("{h} و{m}");
  });

  it("leaves French as it was: 1 h, 58 min, whatever the count", () => {
    expect(say("unit_hour", 1, "fr")).toBe("1 h");
    expect(say("unit_minute", 58, "fr")).toBe("58 min");
    expect(say("unit_day", 2, "fr")).toBe("2 j");
    expect(fr["home.kickoff.in"]).toBe("Coup d'envoi dans");
  });
});

const at = (iso: string) => Date.parse(iso);
const match = (kickoff: string, status: "scheduled" | "postponed" = "scheduled") => ({
  kickoff,
  status,
});

describe("kickoffClock", () => {
  const kickoff = "2026-10-28T18:00:00.000Z";

  it("counts hours and minutes under a day: 1 h 45", () => {
    expect(kickoffClock(match(kickoff), at("2026-10-28T16:15:00.000Z"))).toEqual({
      kind: "countdown",
      days: 0,
      hours: 1,
      minutes: 45,
    });
  });

  it("counts minutes only under an hour, and drops the seconds", () => {
    expect(kickoffClock(match(kickoff), at("2026-10-28T17:35:30.000Z"))).toEqual({
      kind: "countdown",
      days: 0,
      hours: 0,
      minutes: 24,
    });
  });

  it("counts days and hours from a day on", () => {
    expect(kickoffClock(match(kickoff), at("2026-10-26T15:00:00.000Z"))).toEqual({
      kind: "countdown",
      days: 2,
      hours: 3,
      minutes: 0,
    });
  });

  it("is imminent under a minute, and waiting once the kick-off has passed on a match still scheduled", () => {
    expect(kickoffClock(match(kickoff), at("2026-10-28T17:59:30.000Z")).kind).toBe("imminent");
    expect(kickoffClock(match(kickoff), at("2026-10-28T18:00:00.000Z")).kind).toBe("waiting");
    expect(kickoffClock(match(kickoff), at("2026-10-28T19:10:00.000Z")).kind).toBe("waiting");
  });

  it("has nothing to count to when the date or the time is not confirmed", () => {
    expect(kickoffClock(match(kickoff, "postponed"), at("2026-10-28T10:00:00.000Z")).kind).toBe(
      "unconfirmed",
    );
    // The provider's placeholder: midnight UTC.
    expect(
      kickoffClock(match("2026-10-30T00:00:00.000Z"), at("2026-10-28T10:00:00.000Z")).kind,
    ).toBe("unconfirmed");
    expect(kickoffClock(match("not a date"), 0).kind).toBe("unconfirmed");
  });
});

describe("kickoffDay (Casablanca calendar)", () => {
  it("is today for a kick-off on the same Casablanca day", () => {
    expect(kickoffDay("2026-10-28T20:00:00.000Z", at("2026-10-28T09:00:00.000Z"))).toBe("today");
  });

  it("is tomorrow for the next Casablanca day, even a few minutes away across midnight", () => {
    expect(kickoffDay("2026-10-29T00:10:00.000Z", at("2026-10-28T23:50:00.000Z"))).toBe("tomorrow");
    expect(kickoffDay("2026-10-29T17:00:00.000Z", at("2026-10-28T09:00:00.000Z"))).toBe("tomorrow");
  });

  it("is neither for any other day, nor for a date that does not parse", () => {
    expect(kickoffDay("2026-10-30T17:00:00.000Z", at("2026-10-28T09:00:00.000Z"))).toBeNull();
    expect(kickoffDay("2026-10-27T17:00:00.000Z", at("2026-10-28T09:00:00.000Z"))).toBeNull();
    expect(kickoffDay("nope", 0)).toBeNull();
  });

  it("follows Morocco's clock before the 2026-09-20 change (UTC+1), not the viewer's", () => {
    // 23:30Z on 2026-09-10 is 00:30 on the 11th in Casablanca (UTC+1 then).
    expect(kickoffDay("2026-09-10T23:30:00.000Z", at("2026-09-11T08:00:00.000Z"))).toBe("today");
  });
});

describe("clockNow", () => {
  it("is the same moment for every read inside one tick", () => {
    const base = Math.floor(Date.now() / CLOCK_TICK_MS) * CLOCK_TICK_MS;
    expect(clockNow(base + 1)).toBe(clockNow(base + CLOCK_TICK_MS - 1));
    expect(clockNow(base + CLOCK_TICK_MS)).toBe(base + CLOCK_TICK_MS);
  });
});
