import { describe, expect, test } from "bun:test";
import { isWithinQuietHours, nextAllowedDelivery } from "./quiet-hours";

describe("notification quiet hours", () => {
  test("handles a quiet interval crossing midnight", () => {
    const input = { enabled: true, start: "22:00", end: "07:00", timezone: "UTC" };
    expect(isWithinQuietHours(new Date("2030-01-01T23:30:00.000Z"), input)).toBe(true);
    expect(isWithinQuietHours(new Date("2030-01-01T12:00:00.000Z"), input)).toBe(false);
    expect(nextAllowedDelivery(new Date("2030-01-01T23:30:00.000Z"), input).toISOString()).toBe(
      "2030-01-02T07:00:00.000Z",
    );
  });

  test("urgent security delivery bypasses quiet hours", () => {
    const at = new Date("2030-01-01T23:30:00.000Z");
    expect(
      nextAllowedDelivery(at, {
        enabled: true,
        start: "22:00",
        end: "07:00",
        timezone: "Europe/Paris",
        bypass: true,
      }),
    ).toBe(at);
  });
});
