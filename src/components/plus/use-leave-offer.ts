import { useNavigate, useRouter, useRouterState } from "@tanstack/react-router";
import { useCallback, useEffect, useRef } from "react";

import { clearOfferOrigin, offerEntry, rememberOfferOrigin } from "./plus-origin";

/**
 * The offer's steps are history entries (`/curva/plus?step=n`, one entry each), so the phone's Back
 * button is « previous step ». `within` counts the entries the reader has added since the offer
 * began (0 at the page they entered on); `leave` goes back past all of them, to the page the reader
 * came from, whichever step they are on.
 *
 * The offer can span pages: `/plus` → « Voir l'aperçu » opens `/curva/plus`, and a signed-out reader
 * sent to sign-up comes back to it. A page that sends the reader on calls `carry` first, which notes
 * where the offer began (`plus-origin.ts`), so the page that mounts next counts from the same place
 * and Close leaves the whole flow, sign-up included. With nothing known (a deep link, blocked
 * storage) Close goes to `fallback`.
 */
export function useOfferHistory(fallback: "/" | "/curva"): {
  within: number;
  back: () => void;
  leave: () => void;
  carry: () => void;
  href: string;
} {
  const router = useRouter();
  const navigate = useNavigate();
  const location = useRouterState({ select: (s) => s.location });
  const index = (location.state as { __TSR_index?: number }).__TSR_index ?? 0;
  const entry = useRef(-1);
  if (entry.current < 0) entry.current = offerEntry(index);
  // The note has been read; a later, unrelated visit must not inherit it.
  useEffect(() => clearOfferOrigin(), []);
  const within = Math.max(0, index - entry.current);
  const back = useCallback(() => router.history.back(), [router]);
  const carry = useCallback(() => rememberOfferOrigin(entry.current), []);
  const leave = useCallback(() => {
    clearOfferOrigin();
    if (entry.current > 0) router.history.go(-(index - entry.current + 1));
    else void navigate({ to: fallback, replace: true });
  }, [router, navigate, fallback, index]);
  return { within, back, leave, carry, href: location.href };
}
