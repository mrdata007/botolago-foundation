import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { useOptionalAuth } from "@/auth/AuthProvider";
import {
  isMemberState,
  PAYMENT_DETAILS_OFF,
  SEASON_PRICE_MAD,
  type MyPremium,
  type PayCode,
  type PaymentDetails,
  type PremiumPrice,
  type PremiumProductCode,
  type PremiumSource,
  type PremiumState,
  type PremiumStatus,
} from "@/backend/premium/contracts";
import { PREMIUM_SURFACES } from "@/lib/feature-flags";

import { premiumService } from "./premium";

/**
 * `usePremium()`: what the BotolaGO+ screens read. Mocked for now (see `premium.ts`): the shape
 * below is the one lane B's `premium_status` and `get_my_premium` will fill.
 *
 * With `PREMIUM_SURFACES` off this is the constant-off hook: no query, no request, `enabled:
 * false`. The choice is made once, at module level, so no hook is ever called conditionally.
 */
export const premiumKeys = {
  status: ["premium", "status"] as const,
  mine: (userId: string | null) => ["premium", "mine", userId] as const,
  payment: (userId: string | null) => ["premium", "payment", userId] as const,
  payCode: (userId: string | null) => ["premium", "pay-code", userId] as const,
};

export interface PremiumView {
  /** The first answer has arrived (or the feature is off). */
  ready: boolean;
  /** The database mode lets the feature show (mocked in development). */
  enabled: boolean;
  checkoutEnabled: boolean;
  prices: readonly PremiumPrice[];
  signedIn: boolean;
  state: PremiumState;
  /** Carries the member features: active, cancelling or grace. */
  isMember: boolean;
  productCode: PremiumProductCode | null;
  /** Where the membership comes from; `grant` is a complimentary one (no product, no payment). */
  source: PremiumSource | null;
  /** When the reader's Saison ends (or ended). */
  periodEnd: Date | null;
  /** The Saison's price in whole dirhams (the server's, else the owner's 200 MAD). */
  seasonPrice: number;
  /** When a Saison bought now ends: the current Fantasy season's end. Null until known. */
  seasonEnd: Date | null;
}

/** The pure part: two server answers and a sign-in flag in, one view out. */
export function derivePremium(
  status: PremiumStatus | undefined,
  mine: MyPremium | undefined,
  signedIn: boolean,
): Omit<PremiumView, "ready"> {
  const statusEnabled = status?.enabled === true;
  // Database mode `preview`: the status discloses nothing (`enabled: false`), and
  // `get_my_premium` answers `available: true` for members alone. That reader, and only that
  // reader, sees BotolaGO+ as a member. Everyone else reads exactly as before: off.
  const previewMember =
    !statusEnabled && signedIn && mine?.available === true && isMemberState(mine.state);
  const enabled = statusEnabled || previewMember;
  const member = enabled && signedIn && mine?.available === true ? mine : null;
  const state: PremiumState = member ? member.state : "none";
  const season = status?.prices.find((price) => price.code === "plus_season");
  return {
    enabled,
    checkoutEnabled: enabled && status?.checkoutEnabled === true,
    prices: status?.prices ?? [],
    signedIn,
    state,
    isMember: isMemberState(state),
    productCode: member?.productCode ?? null,
    source: member?.source ?? null,
    periodEnd: member?.currentPeriodEnd ? new Date(member.currentPeriodEnd) : null,
    seasonPrice: season?.amountMad ?? SEASON_PRICE_MAD,
    seasonEnd: season?.validUntil ? new Date(season.validUntil) : null,
  };
}

const OFF_VIEW: PremiumView = {
  ready: true,
  ...derivePremium(undefined, undefined, false),
};

function useOffPremium(): PremiumView {
  return OFF_VIEW;
}

/**
 * The first answer is in: the status has answered, the session has been restored, and a signed-in
 * reader's membership has answered. Waiting for the session matters in preview: a returning member
 * reads as signed out until it is restored, and an offer screen that saw "ready, not a member" then
 * would close before the membership could be asked.
 */
export function premiumReady(input: {
  statusPending: boolean;
  authLoading: boolean;
  mineLoading: boolean;
}): boolean {
  return !input.statusPending && !input.authLoading && !input.mineLoading;
}

function useLivePremium(): PremiumView {
  const auth = useOptionalAuth();
  // No provider (a server render without one): nothing to restore.
  const authLoading = auth?.status === "loading";
  const user = auth?.user ?? null;
  const userId = user?.id ?? null;
  const status = useQuery({
    queryKey: premiumKeys.status,
    queryFn: ({ signal }) => premiumService.status(signal),
    staleTime: 60_000,
    retry: false,
  });
  const mine = useQuery({
    queryKey: premiumKeys.mine(userId),
    queryFn: ({ signal }) => premiumService.mine(signal),
    // Also while the status says "not enabled": in preview that is how a member is discovered.
    // Waits for the status so a database that has no functions yet is asked once, not twice.
    enabled: userId !== null && status.data !== undefined,
    staleTime: 30_000,
    retry: false,
  });
  return useMemo(
    () => ({
      ready: premiumReady({
        statusPending: status.isPending,
        authLoading,
        mineLoading: mine.isLoading,
      }),
      ...derivePremium(status.data, mine.data, userId !== null),
    }),
    [status.isPending, status.data, authLoading, mine.isLoading, mine.data, userId],
  );
}

export const usePremium: () => PremiumView = PREMIUM_SURFACES ? useLivePremium : useOffPremium;

/** What the pay screen reads: how to pay, and the reader's personal code. */
export interface PayView {
  /** Both answers are in (or the reader is signed out / the feature is off). */
  ready: boolean;
  details: PaymentDetails;
  code: string | null;
}

const OFF_PAY: PayView = { ready: true, details: PAYMENT_DETAILS_OFF, code: null };

function useLivePay(enabled: boolean): PayView {
  const user = useOptionalAuth()?.user ?? null;
  const userId = user?.id ?? null;
  const on = enabled && userId !== null;
  const details = useQuery({
    queryKey: premiumKeys.payment(userId),
    queryFn: ({ signal }) => premiumService.paymentDetails(signal),
    enabled: on,
    staleTime: 60_000,
    retry: false,
  });
  const code = useQuery<PayCode>({
    queryKey: premiumKeys.payCode(userId),
    queryFn: ({ signal }) => premiumService.payCode(signal),
    enabled: on,
    staleTime: 5 * 60_000,
    retry: false,
  });
  return useMemo(
    () => ({
      ready: !on || (!details.isPending && !code.isPending) || details.isError,
      details: details.data ?? PAYMENT_DETAILS_OFF,
      code: code.data?.code ?? null,
    }),
    [on, details.isPending, details.isError, details.data, code.isPending, code.data],
  );
}
const useOffPay = (_enabled: boolean): PayView => OFF_PAY;

/** The pay screen's reads (payment details and the personal code). Signed in only. */
export const usePremiumPay: (enabled: boolean) => PayView = PREMIUM_SURFACES
  ? useLivePay
  : useOffPay;
