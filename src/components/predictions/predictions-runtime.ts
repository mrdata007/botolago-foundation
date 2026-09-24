import { GuestPredictionStore } from "@/backend/predictions/guest-store";

/**
 * The two pieces of Pronostics state that live for the whole visit, outside
 * React: the gap between the server's clock and the phone's, and the guest
 * store. Kept free of React and auth imports so the sign-in import
 * (`guest-claim.ts`, called from AuthProvider) can use them without a cycle.
 */

/** The gap between the server's clock and the phone's, from the last answer. */
let serverOffsetMs = 0;

export function noteServerTime(serverTime: string): void {
  const server = Date.parse(serverTime);
  if (Number.isFinite(server)) serverOffsetMs = server - Date.now();
}

/** The server's clock as the page knows it: lock states follow this, never the phone. */
export function serverNow(): number {
  return Date.now() + serverOffsetMs;
}

let guestStore: GuestPredictionStore | null = null;

export function getGuestStore(): GuestPredictionStore {
  guestStore ??= new GuestPredictionStore();
  return guestStore;
}
