import { useNavigate, useRouter, useRouterState } from "@tanstack/react-router";
import { useCallback, useRef } from "react";

/**
 * The offer's steps are history entries (`/curva/plus?step=n`, one entry each), so the phone's Back
 * button is « previous step ». `within` counts the entries the reader has added inside the offer
 * (0 at the page they entered on); `leave` goes back past all of them, to the page the reader came
 * from, whichever step they are on.
 */
export function useOfferHistory(fallback: "/" | "/curva"): {
  within: number;
  back: () => void;
  leave: () => void;
  href: string;
} {
  const router = useRouter();
  const navigate = useNavigate();
  const location = useRouterState({ select: (s) => s.location });
  const index = (location.state as { __TSR_index?: number }).__TSR_index ?? 0;
  const entry = useRef(index);
  const within = Math.max(0, index - entry.current);
  const back = useCallback(() => router.history.back(), [router]);
  const leave = useCallback(() => {
    if (entry.current > 0) router.history.go(-(index - entry.current + 1));
    else void navigate({ to: fallback, replace: true });
  }, [router, navigate, fallback, index]);
  return { within, back, leave, href: location.href };
}
