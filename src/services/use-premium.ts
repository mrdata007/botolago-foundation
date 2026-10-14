import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

import { useOptionalAuth } from "@/auth/AuthProvider";
import {
  isMemberState,
  type MyPremium,
  type PremiumActionResult,
  type PremiumPrice,
  type PremiumProductCode,
  type PremiumReceipt,
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
  receipts: (userId: string | null) => ["premium", "receipts", userId] as const,
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
  /** End of the paid period (the renewal date for the monthly pass). */
  periodEnd: Date | null;
  /** Cancelled, the period is not over: no renewal. */
  cancelling: boolean;
  startCheckout: (product: PremiumProductCode) => Promise<PremiumActionResult>;
  cancel: () => Promise<PremiumActionResult>;
  restore: () => Promise<PremiumActionResult>;
}

/** The pure part: two server answers and a sign-in flag in, one view out. */
export function derivePremium(
  status: PremiumStatus | undefined,
  mine: MyPremium | undefined,
  signedIn: boolean,
): Omit<PremiumView, "startCheckout" | "cancel" | "restore" | "ready"> {
  const statusEnabled = status?.enabled === true;
  // Database mode `preview`: the status discloses nothing (`enabled: false`), and
  // `get_my_premium` answers `available: true` for members alone. That reader, and only that
  // reader, sees BotolaGO+ as a member. Everyone else reads exactly as before: off.
  const previewMember =
    !statusEnabled && signedIn && mine?.available === true && isMemberState(mine.state);
  const enabled = statusEnabled || previewMember;
  const member = enabled && signedIn && mine?.available === true ? mine : null;
  const state: PremiumState = member ? member.state : "none";
  return {
    enabled,
    checkoutEnabled: enabled && status?.checkoutEnabled === true,
    prices: status?.prices ?? [],
    signedIn,
    state,
    isMember: isMemberState(state),
    productCode: member?.productCode ?? null,
    periodEnd: member?.currentPeriodEnd ? new Date(member.currentPeriodEnd) : null,
    cancelling: member ? member.cancelAtPeriodEnd || state === "cancelling" : false,
  };
}

const soon = async (): Promise<PremiumActionResult> => ({ status: "soon" });

const OFF_VIEW: PremiumView = {
  ready: true,
  ...derivePremium(undefined, undefined, false),
  startCheckout: soon,
  cancel: soon,
  restore: soon,
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
  const startCheckout = useCallback(
    (product: PremiumProductCode) => premiumService.startCheckout(product),
    [],
  );
  const cancel = useCallback(() => premiumService.cancel(), []);
  const restore = useCallback(() => premiumService.restore(), []);
  return useMemo(
    () => ({
      ready: premiumReady({
        statusPending: status.isPending,
        authLoading,
        mineLoading: mine.isLoading,
      }),
      ...derivePremium(status.data, mine.data, userId !== null),
      startCheckout,
      cancel,
      restore,
    }),
    [
      status.isPending,
      status.data,
      authLoading,
      mine.isLoading,
      mine.data,
      userId,
      startCheckout,
      cancel,
      restore,
    ],
  );
}

export const usePremium: () => PremiumView = PREMIUM_SURFACES ? useLivePremium : useOffPremium;

function useLiveReceipts(enabled: boolean): readonly PremiumReceipt[] {
  const user = useOptionalAuth()?.user ?? null;
  const userId = user?.id ?? null;
  const query = useQuery({
    queryKey: premiumKeys.receipts(userId),
    queryFn: ({ signal }) => premiumService.receipts(signal),
    enabled: enabled && userId !== null,
    staleTime: 60_000,
    retry: false,
  });
  return query.data ?? [];
}
const NO_RECEIPTS: readonly PremiumReceipt[] = [];
const useNoReceipts = (): readonly PremiumReceipt[] => NO_RECEIPTS;

/** The member's payments, for the Profil list. Empty until lane F serves them. */
export const usePremiumReceipts: (enabled: boolean) => readonly PremiumReceipt[] = PREMIUM_SURFACES
  ? useLiveReceipts
  : useNoReceipts;
