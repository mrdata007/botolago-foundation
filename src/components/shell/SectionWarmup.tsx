import { useRouter, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";

import { savesData, sectionsToWarm, warmSections, type WarmupRouter } from "@/lib/section-warmup";
import { usePrimaryNavItems } from "./primary-nav";

/** Once per page load: a later page settling does not start it again. */
let warmed = false;

/**
 * Fetches the other primary sections' code once the first page has settled
 * and finished loading (src/lib/section-warmup.ts). Renders nothing.
 *
 * "Finished loading" is the window's `load` event, not the router settling:
 * the router settles at hydration, while the page's own fonts and images can
 * still be coming in for seconds on a slow connection, and the warm-up must
 * not take bandwidth from them.
 */
export function SectionWarmup() {
  const router = useRouter();
  const settledPath = useRouterState({ select: (state) => state.resolvedLocation?.pathname });
  const items = usePrimaryNavItems();

  useEffect(() => {
    if (warmed || settledPath === undefined || savesData()) return;
    const start = () => {
      warmed = true;
      void warmSections(
        router as unknown as WarmupRouter,
        sectionsToWarm(
          items.map((item) => item.to),
          settledPath,
        ),
      );
    };
    if (document.readyState === "complete") return start();
    window.addEventListener("load", start, { once: true });
    return () => window.removeEventListener("load", start);
  }, [router, settledPath, items]);

  return null;
}
