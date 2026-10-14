import { describe, expect, it } from "bun:test";

import { LAUNCH_PRICES, type PremiumPrice } from "@/backend/premium/contracts";

import {
  REMINDER_DAYS,
  addMonths,
  billingCalendar,
  daysUntil,
  priceOf,
  renewalReminderDue,
  yearlyPerMonth,
  yearlySaving,
} from "./plus-pricing";

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day, 10, 30);
const ymd = (date: Date) => [date.getFullYear(), date.getMonth() + 1, date.getDate()];

describe("the owner's prices", () => {
  it("are 20 MAD a month and 200 MAD a year, 12 months, the year not renewing", () => {
    expect(priceOf("plus_monthly")).toEqual({
      code: "plus_monthly",
      amountMad: 20,
      periodMonths: 1,
      renews: true,
    });
    expect(priceOf("plus_yearly")).toEqual({
      code: "plus_yearly",
      amountMad: 200,
      periodMonths: 12,
      renews: false,
    });
  });
  it("fall back to the launch prices when the server list lacks a product", () => {
    expect(priceOf("plus_yearly", [])).toEqual(LAUNCH_PRICES[1]!);
  });
  it("show 16.67 MAD a month for the year", () => {
    expect(yearlyPerMonth().toFixed(2)).toBe("16.67");
  });
});

describe("the saving", () => {
  it("is 40 MAD against 12 monthly payments (12 x 20 = 240), whatever the day", () => {
    for (const day of [d(2026, 10, 13), d(2026, 1, 31), d(2028, 2, 29), d(2026, 12, 31)]) {
      expect(yearlySaving(day)).toEqual({ months: 12, saving: 40, show: true, monthlyTotal: 240 });
    }
  });
  it("is hidden when it is zero or negative, with no promise in its place", () => {
    const flat: PremiumPrice[] = [LAUNCH_PRICES[0]!, { ...LAUNCH_PRICES[1]!, amountMad: 240 }];
    expect(yearlySaving(d(2026, 10, 13), flat)).toMatchObject({ saving: 0, show: false });
    const dearer = [LAUNCH_PRICES[0]!, { ...LAUNCH_PRICES[1]!, amountMad: 300 }];
    expect(yearlySaving(d(2026, 10, 13), dearer)).toMatchObject({ saving: -60, show: false });
  });
});

describe("the calendar", () => {
  it("adds months and clamps to the end of a shorter month", () => {
    expect(ymd(addMonths(d(2026, 1, 31), 1))).toEqual([2026, 2, 28]);
    expect(ymd(addMonths(d(2028, 1, 31), 1))).toEqual([2028, 2, 29]);
    expect(ymd(addMonths(d(2026, 10, 13), 1))).toEqual([2026, 11, 13]);
    expect(ymd(addMonths(d(2026, 12, 15), 1))).toEqual([2027, 1, 15]);
  });
  it("renews the month one month on, reminds three days before, ends the year after 12 months", () => {
    const cal = billingCalendar(d(2026, 10, 13));
    expect(ymd(cal.nextMonthly)).toEqual([2026, 11, 13]);
    expect(ymd(cal.reminder)).toEqual([2026, 11, 10]);
    expect(ymd(cal.yearlyUntil)).toEqual([2027, 10, 13]);
    expect(REMINDER_DAYS).toBe(3);
  });
  it("counts calendar days, not 24-hour spans", () => {
    expect(daysUntil(new Date(2026, 10, 2, 0, 1), new Date(2026, 10, 1, 23, 59))).toBe(1);
    expect(daysUntil(new Date(2026, 10, 1, 9), new Date(2026, 10, 1, 17))).toBe(0);
    expect(daysUntil(new Date(2026, 9, 30), new Date(2026, 10, 1))).toBe(-2);
  });
});

describe("the J-3 reminder", () => {
  const now = d(2026, 11, 10);
  const base = {
    productCode: "plus_monthly" as const,
    state: "active",
    cancelling: false,
    now,
  };
  it("shows for a monthly membership three days or fewer before the renewal", () => {
    expect(renewalReminderDue({ ...base, periodEnd: d(2026, 11, 13) })).toEqual({
      due: true,
      days: 3,
    });
    expect(renewalReminderDue({ ...base, periodEnd: d(2026, 11, 10) })).toEqual({
      due: true,
      days: 0,
    });
  });
  it("waits while the renewal is further than three days off, and never shows after it", () => {
    expect(renewalReminderDue({ ...base, periodEnd: d(2026, 11, 14) }).due).toBe(false);
    expect(renewalReminderDue({ ...base, periodEnd: d(2026, 11, 9) }).due).toBe(false);
  });
  it("never shows for a year (nothing renews), a cancelled membership, or a state without access", () => {
    const end = d(2026, 11, 12);
    expect(renewalReminderDue({ ...base, productCode: "plus_yearly", periodEnd: end }).due).toBe(
      false,
    );
    expect(renewalReminderDue({ ...base, cancelling: true, periodEnd: end }).due).toBe(false);
    for (const state of ["cancelling", "grace", "expired", "none"]) {
      expect(renewalReminderDue({ ...base, state, periodEnd: end }).due).toBe(false);
    }
    expect(renewalReminderDue({ ...base, periodEnd: null }).due).toBe(false);
  });
});
