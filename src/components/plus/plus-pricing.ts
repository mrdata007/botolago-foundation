import { LAUNCH_PRICES, SEASON_PRICE_MAD, type PremiumPrice } from "@/backend/premium/contracts";

/**
 * The Saison's price and dates, read and never typed (owner decision of 2026-10-15: one purchase,
 * 200 MAD whenever it is bought, valid until the end of the current Fantasy season, no renewal).
 *
 * The price and `validUntil` come from the server's list; the launch price is the fallback so the
 * screen never shows an empty card while the list is on its way.
 */

/** The Saison's price entry, from the server's list when it has it, else the launch price. */
export function seasonPriceOf(prices: readonly PremiumPrice[] = LAUNCH_PRICES): PremiumPrice {
  return (
    prices.find((price) => price.code === "plus_season") ??
    LAUNCH_PRICES.find((price) => price.code === "plus_season") ?? {
      code: "plus_season",
      amountMad: SEASON_PRICE_MAD,
      periodMonths: null,
      renews: false,
      validUntil: null,
    }
  );
}

/** When the Saison ends, as a date, or null while the server has not said. */
export function seasonEndOf(prices: readonly PremiumPrice[] = LAUNCH_PRICES): Date | null {
  const until = seasonPriceOf(prices).validUntil;
  return until ? new Date(until) : null;
}

/** Whole days from `now` to `end`, counting calendar days (so 23:59 to 00:01 next day is 1). */
export function daysUntil(end: Date, now: Date): number {
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const b = new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime();
  return Math.round((b - a) / 86_400_000);
}
