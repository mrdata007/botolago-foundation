import { PREMIUM_SURFACES } from "@/lib/feature-flags";

/**
 * Whether the BotolaGO+ routes (`/curva/plus`, `/plus`) send the visitor away: the build switch is
 * off. Same shape as `shouldRedirectFromCurva` (`src/services/manager-card-status.ts`), which this
 * does not replace: `/curva/plus` is also behind the Curva layout's own guard.
 *
 * The database's own answer (`premium_status().enabled`, lane B) is read by the page through
 * `usePremium()`; while it says no, the page leaves on its own. The build constant is the one
 * layer that can stop a route before any loader or component runs.
 */
export function shouldRedirectFromPlus(build: boolean = PREMIUM_SURFACES): boolean {
  return !build;
}
