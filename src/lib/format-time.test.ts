import { describe, expect, it } from "bun:test";
import { formatFullDate, formatMoroccoDate, formatRelativeTime } from "./format-time";

describe("Moroccan-locale date/time formatting", () => {
  it("formats the full date for ar with Western (latn) digits only", () => {
    const formatted = formatFullDate("2026-09-18T14:30:00Z", "ar");
    expect(formatted).not.toBe("");
    expect(formatted).toMatch(/^[^٠-٩]*$/);
  });

  it("formats the full date for fr matching fr-FR Intl output", () => {
    const iso = "2026-09-18T14:30:00Z";
    const expected = new Intl.DateTimeFormat("fr-FR", {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
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
 * Audit 2026-10-14, LOC-07: the MFA enrollment date was
 * `toLocaleDateString()`, the browser's language and time zone, so an English
 * browser showed `10/14/2026` inside a French or Arabic page.
 */
describe("formatMoroccoDate", () => {
  const ENROLLED = "2026-10-14T09:30:00Z";

  it("is the chosen language's date, whatever the browser's own locale", () => {
    // What the old call said for an English browser: a US date.
    expect(new Date(ENROLLED).toLocaleDateString("en-US", { timeZone: "UTC" })).toBe("10/14/2026");
    expect(formatMoroccoDate(ENROLLED, "fr")).toBe("14 octobre 2026");
    const ar = formatMoroccoDate(ENROLLED, "ar");
    expect(ar).toContain("14");
    expect(ar).toContain("2026");
    expect(ar).toMatch(/[؀-ۿ]/); // an Arabic month name
    expect(ar).not.toContain("10/14");
  });

  it("uses Latin digits in Arabic", () => {
    expect(formatMoroccoDate(ENROLLED, "ar")).toMatch(/^[^٠-٩۰-۹]*$/);
  });

  it("names the day on Morocco's calendar, not UTC's or the browser's", () => {
    // 23:30 UTC on 10 July 2026 is already 11 July in Casablanca (UTC+1 then).
    expect(formatMoroccoDate("2026-07-10T23:30:00Z", "fr")).toBe("11 juillet 2026");
    // From 20 September 2026 Morocco keeps UTC+0: the UTC day is the day.
    expect(formatMoroccoDate("2026-10-14T23:30:00Z", "fr")).toBe("14 octobre 2026");
  });

  it("is empty for an invalid date", () => {
    expect(formatMoroccoDate("not a date", "fr")).toBe("");
    expect(formatMoroccoDate("", "ar")).toBe("");
  });
});
