import {
  LAUNCH_PRICES,
  type PremiumPrice,
  type PremiumProductCode,
} from "@/backend/premium/contracts";

/**
 * Prices, dates and the saving of BotolaGO+, computed and never typed (plan 3.0c and 3.0d, with the
 * owner's prices of 2026-10-13: 20 MAD a month, 200 MAD a year, 12 months from purchase, no
 * automatic renewal for the year).
 *
 * Dates come from the calendar in the reader's time zone. The monthly pass renews one month after
 * purchase (the billing anniversary, clamped to the end of a short month), the yearly pass ends
 * twelve months after purchase, and the reminder goes out three days before each renewal.
 */

/** Days before a monthly renewal when the reminder shows (the J-3 reminder). */
export const REMINDER_DAYS = 3;

/** The price of a product, from the server's list when it has it, else the launch prices. */
export function priceOf(
  code: PremiumProductCode,
  prices: readonly PremiumPrice[] = LAUNCH_PRICES,
): PremiumPrice {
  const found = prices.find((price) => price.code === code);
  // The launch list always carries both products.
  return found ?? LAUNCH_PRICES.find((price) => price.code === code)!;
}

/** `d` plus `n` months, clamped to the last day of a shorter month (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(d: Date, n: number): Date {
  const r = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const last = new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate();
  r.setDate(Math.min(d.getDate(), last));
  return r;
}

export interface BillingCalendar {
  today: Date;
  /** Next monthly charge: one month from today. */
  nextMonthly: Date;
  /** The reminder for that charge: three days before it. */
  reminder: Date;
  /** The yearly pass ends here: twelve months from today. */
  yearlyUntil: Date;
}

export function billingCalendar(now: Date): BillingCalendar {
  const nextMonthly = addMonths(now, 1);
  return {
    today: now,
    nextMonthly,
    reminder: new Date(
      nextMonthly.getFullYear(),
      nextMonthly.getMonth(),
      nextMonthly.getDate() - REMINDER_DAYS,
    ),
    yearlyUntil: addMonths(now, 12),
  };
}

export interface YearlySaving {
  /** Monthly payments over the same twelve months. */
  months: number;
  /** Whole dirhams saved against those payments. */
  saving: number;
  /** Hidden when zero or negative: no promise of an offer in its place. */
  show: boolean;
  /** 12 payments of the monthly price, for the terms' « 20 MAD x 12 = 240 MAD ». */
  monthlyTotal: number;
}

/**
 * The saving against monthly payments over the same period, so the basis can never contradict the
 * date: the yearly pass runs twelve months, so the comparison is twelve monthly payments.
 */
export function yearlySaving(
  now: Date,
  prices: readonly PremiumPrice[] = LAUNCH_PRICES,
): YearlySaving {
  const monthly = priceOf("plus_monthly", prices);
  const yearly = priceOf("plus_yearly", prices);
  const end = addMonths(now, yearly.periodMonths);
  let months = 0;
  while (addMonths(now, months) < end) months++;
  const monthlyTotal = monthly.amountMad * months;
  const saving = monthlyTotal - yearly.amountMad;
  return { months, saving, show: saving > 0, monthlyTotal };
}

/** The yearly price per month, for « Soit 16,67 MAD par mois ». */
export function yearlyPerMonth(prices: readonly PremiumPrice[] = LAUNCH_PRICES): number {
  const yearly = priceOf("plus_yearly", prices);
  return yearly.amountMad / yearly.periodMonths;
}

/** Whole days from `now` to `end`, counting calendar days (so 23:59 to 00:01 next day is 1). */
export function daysUntil(end: Date, now: Date): number {
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const b = new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime();
  return Math.round((b - a) / 86_400_000);
}

/**
 * The J-3 reminder: the monthly pass, still going to renew, three days or fewer before the
 * renewal and not past it. A cancelling membership, a yearly pass (nothing renews) and any state
 * without the member features never show it.
 */
export function renewalReminderDue(input: {
  productCode: PremiumProductCode | null;
  state: string;
  cancelling: boolean;
  periodEnd: Date | null;
  now: Date;
}): { due: boolean; days: number } {
  const { productCode, state, cancelling, periodEnd, now } = input;
  if (productCode !== "plus_monthly" || state !== "active" || cancelling || periodEnd === null) {
    return { due: false, days: 0 };
  }
  const days = daysUntil(periodEnd, now);
  return { due: days >= 0 && days <= REMINDER_DAYS, days };
}
