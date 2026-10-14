import { useNavigate, useRouter } from "@tanstack/react-router";
import { useCallback } from "react";

/** Leave the offer: back to where the reader came from, else to `fallback`. */
export function useLeaveOffer(fallback: "/" | "/curva"): () => void {
  const router = useRouter();
  const navigate = useNavigate();
  return useCallback(() => {
    if (router.history.canGoBack()) router.history.back();
    else void navigate({ to: fallback, replace: true });
  }, [router, navigate, fallback]);
}
