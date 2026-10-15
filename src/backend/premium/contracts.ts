import { z } from "zod";

import type { RepositoryContext } from "@/backend/contracts/repository";

/**
 * BotolaGO+ membership contracts (docs/plans/BOTOLAGO_PLUS_PLAN.md sections 5.2 to 5.4).
 *
 * These are the shapes the front end reads. Lane B's `api.premium_status()` and
 * `api.get_my_premium()` must answer them; until they exist the screens run on the mock
 * repository (`mock-repository.ts`, development only). camelCase, like the Manager Card DTOs.
 *
 * "Switched off" is an answer, not an error: with the database mode `off`, `premium_status`
 * answers `enabled: false` and `get_my_premium` answers `{ available: false }`, HTTP 200, never a
 * 4xx (the Manager Card and Pépites pattern).
 *
 * Money is whole dirhams and the period is whole months. Dates are ISO strings with an offset.
 */

const iso = z.string().datetime({ offset: true });

/**
 * The products (`premium_products.code`). Only `plus_season` is offered (owner decision, 2026-10-15:
 * one purchase, valid until the end of the Fantasy season). The monthly and yearly codes stay so that
 * old data still parses; no screen offers them.
 */
export const PREMIUM_PRODUCT_CODES = ["plus_season", "plus_monthly", "plus_yearly"] as const;
export type PremiumProductCode = (typeof PREMIUM_PRODUCT_CODES)[number];

/** Subscription states (plan 5.2). `none` is "never subscribed". */
export const PREMIUM_STATES = [
  "none",
  "active",
  "cancelling",
  "grace",
  "on_hold",
  "expired",
  "refunded",
  "revoked",
] as const;
export type PremiumState = (typeof PREMIUM_STATES)[number];

/** States that carry the member features (plan 5.2 table, "Member features?" column). */
export const MEMBER_STATES: readonly PremiumState[] = ["active", "cancelling", "grace"];

export const PREMIUM_SOURCES = ["web", "apple", "google", "grant"] as const;
export type PremiumSource = (typeof PREMIUM_SOURCES)[number];

export const premiumPriceSchema = z.object({
  code: z.enum(PREMIUM_PRODUCT_CODES),
  /** Whole dirhams, all taxes included. */
  amountMad: z.number().int().positive(),
  /** Null for the Saison: its validity is the season's end, not a number of months. */
  periodMonths: z.number().int().positive().nullable(),
  /** The Saison never renews. */
  renews: z.boolean(),
  /** When the Saison ends (the current Fantasy season's end), as an ISO string. */
  validUntil: iso.nullable(),
});
export type PremiumPrice = z.infer<typeof premiumPriceSchema>;

/** `api.premium_status()`: anonymous, never raises. */
export const premiumStatusSchema = z.object({
  enabled: z.boolean(),
  checkoutEnabled: z.boolean(),
  prices: z.array(premiumPriceSchema),
});
export type PremiumStatus = z.infer<typeof premiumStatusSchema>;

/**
 * One price as `api.premium_status()` sends it: centimes and a currency
 * (`supabase/migrations/20261013100200_premium_api.sql`). Only whole dirhams convert; anything
 * else fails to parse rather than showing a rounded price.
 */
const premiumPriceWireSchema = z
  .object({
    code: z.enum(PREMIUM_PRODUCT_CODES),
    periodMonths: z.number().int().positive().nullable().optional(),
    renews: z.boolean(),
    priceMinor: z.number().int().positive().multipleOf(100),
    currency: z.literal("MAD"),
    validUntil: iso.nullable().optional(),
  })
  .transform(({ code, periodMonths, renews, priceMinor, validUntil }) => ({
    code,
    amountMad: priceMinor / 100,
    periodMonths: periodMonths ?? null,
    renews,
    validUntil: validUntil ?? null,
  }));

/** The raw `api.premium_status()` answer, converted to `PremiumStatus`. */
export const premiumStatusWireSchema = z
  .object({
    enabled: z.boolean(),
    checkoutEnabled: z.boolean(),
    prices: z.array(premiumPriceWireSchema),
  })
  .pipe(premiumStatusSchema);

/** `api.get_my_premium()`: signed in. `{ available: false }` while the feature is off. */
export const myPremiumSchema = z.discriminatedUnion("available", [
  z.object({ available: z.literal(false) }),
  z.object({
    available: z.literal(true),
    state: z.enum(PREMIUM_STATES),
    productCode: z.enum(PREMIUM_PRODUCT_CODES).nullable(),
    source: z.enum(PREMIUM_SOURCES).nullable(),
    currentPeriodEnd: iso.nullable(),
    cancelAtPeriodEnd: z.boolean(),
  }),
]);
export type MyPremium = z.infer<typeof myPremiumSchema>;
export type MyPremiumAvailable = Extract<MyPremium, { available: true }>;

/** The owner's price, 2026-10-15: 200 MAD, the same whenever it is bought. */
export const SEASON_PRICE_MAD = 200;
export const LAUNCH_PRICES: readonly PremiumPrice[] = [
  {
    code: "plus_season",
    amountMad: SEASON_PRICE_MAD,
    periodMonths: null,
    renews: false,
    validUntil: null,
  },
];

/**
 * How a buyer pays today (`api.get_premium_payment_details()`): by hand, with a receipt sent on
 * WhatsApp. The details are typed in by the owner in the admin screen; none of them is in code.
 * `{ available: false }` while the mode is off or no WhatsApp number is set.
 */
const text = z.string().nullable().optional();
export const paymentDetailsSchema = z
  .object({
    available: z.boolean(),
    whatsapp: text,
    bankHolder: text,
    bankName: text,
    rib: text,
    cashplusName: text,
    noteFr: text,
    noteAr: text,
    amountMinor: z.number().int().nonnegative().optional(),
    currency: z.string().optional(),
  })
  .transform((value) => ({
    available: value.available && Boolean(value.whatsapp),
    whatsapp: value.whatsapp ?? null,
    bankHolder: value.bankHolder ?? null,
    bankName: value.bankName ?? null,
    rib: value.rib ?? null,
    cashplusName: value.cashplusName ?? null,
    noteFr: value.noteFr ?? null,
    noteAr: value.noteAr ?? null,
    amountMad: (value.amountMinor ?? SEASON_PRICE_MAD * 100) / 100,
  }));
export type PaymentDetails = z.infer<typeof paymentDetailsSchema>;
export const PAYMENT_DETAILS_OFF: PaymentDetails = {
  available: false,
  whatsapp: null,
  bankHolder: null,
  bankName: null,
  rib: null,
  cashplusName: null,
  noteFr: null,
  noteAr: null,
  amountMad: SEASON_PRICE_MAD,
};

/** `api.get_my_premium_pay_code()`: `{ code }`, or `{ available: false }` while the mode is off. */
export const payCodeSchema = z
  .object({ available: z.boolean().optional(), code: z.string().nullable().optional() })
  .transform((value) => ({
    code: value.available === false || !value.code ? null : value.code,
  }));
export type PayCode = z.infer<typeof payCodeSchema>;

/** Whether a state carries the member features. */
export function isMemberState(state: PremiumState): boolean {
  return MEMBER_STATES.includes(state);
}

/**
 * The reads the Saison screens use: the public facts, the caller's own Saison, how to pay and the
 * caller's personal payment code. There is no checkout, cancel or restore: staff activate a Saison
 * once the receipt has been checked.
 */
export interface PremiumRepository {
  status(context: RepositoryContext): Promise<PremiumStatus>;
  mine(context: RepositoryContext): Promise<MyPremium>;
  getPaymentDetails(context: RepositoryContext): Promise<PaymentDetails>;
  getMyPayCode(context: RepositoryContext): Promise<PayCode>;
}

/** The answer when the feature is off, or when no repository exists yet. */
export const PREMIUM_STATUS_OFF: PremiumStatus = {
  enabled: false,
  checkoutEnabled: false,
  prices: [],
};
export const MY_PREMIUM_OFF: MyPremium = { available: false };
