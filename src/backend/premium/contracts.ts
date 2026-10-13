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

/** The two products (plan 5.3 `premium_products.code`). The season pass of earlier drafts is gone. */
export const PREMIUM_PRODUCT_CODES = ["plus_monthly", "plus_yearly"] as const;
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
  /** 1 for the monthly pass, 12 for the yearly one. */
  periodMonths: z.number().int().positive(),
  /** The monthly pass renews at the same price; the yearly pass never renews by itself. */
  renews: z.boolean(),
});
export type PremiumPrice = z.infer<typeof premiumPriceSchema>;

/** `api.premium_status()`: anonymous, never raises. */
export const premiumStatusSchema = z.object({
  enabled: z.boolean(),
  checkoutEnabled: z.boolean(),
  prices: z.array(premiumPriceSchema),
});
export type PremiumStatus = z.infer<typeof premiumStatusSchema>;

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

/** One payment, for the receipts list in Profil (lane F serves it; empty until then). */
export const premiumReceiptSchema = z.object({
  id: z.string(),
  paidAt: iso,
  amountMad: z.number().int().nonnegative(),
  productCode: z.enum(PREMIUM_PRODUCT_CODES),
  /** A link to the invoice, or null while it is being made. */
  url: z.string().url().nullable(),
});
export type PremiumReceipt = z.infer<typeof premiumReceiptSchema>;

/** The owner's prices, 2026-10-13: 20 MAD a month, 200 MAD a year (12 months from purchase). */
export const LAUNCH_PRICES: readonly PremiumPrice[] = [
  { code: "plus_monthly", amountMad: 20, periodMonths: 1, renews: true },
  { code: "plus_yearly", amountMad: 200, periodMonths: 12, renews: false },
];

/** Whether a state carries the member features. */
export function isMemberState(state: PremiumState): boolean {
  return MEMBER_STATES.includes(state);
}

/**
 * What an action that lane F or G will build answers today. `soon` is not a failure: the screens
 * show the « bientôt » message and nothing else happens.
 */
export type PremiumActionResult = { status: "soon" } | { status: "ok" } | { status: "error" };

/**
 * The reads lane B will serve, plus the actions later lanes will. Only `status` and `mine` map to
 * database functions of lane B (`premium_status`, `get_my_premium`); the rest are stubs that
 * answer `soon` (checkout, cancel, restore) or an empty list (receipts).
 */
export interface PremiumRepository {
  status(context: RepositoryContext): Promise<PremiumStatus>;
  mine(context: RepositoryContext): Promise<MyPremium>;
  receipts(context: RepositoryContext): Promise<readonly PremiumReceipt[]>;
  startCheckout(
    product: PremiumProductCode,
    context: RepositoryContext,
  ): Promise<PremiumActionResult>;
  cancel(context: RepositoryContext): Promise<PremiumActionResult>;
  restore(context: RepositoryContext): Promise<PremiumActionResult>;
}

/** The answer when the feature is off, or when no repository exists yet. */
export const PREMIUM_STATUS_OFF: PremiumStatus = {
  enabled: false,
  checkoutEnabled: false,
  prices: [],
};
export const MY_PREMIUM_OFF: MyPremium = { available: false };
