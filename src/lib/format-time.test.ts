import { describe, expect, it } from "bun:test";
import { formatFullDate, formatRelativeTime } from "./format-time";

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
