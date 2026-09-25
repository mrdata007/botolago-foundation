import type { QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { mapPredictionsError } from "@/backend/predictions/errors";
import type { TranslationKey } from "@/i18n/dictionaries";
import { PRONOSTICS_ENABLED } from "@/lib/feature-flags";
import { predictionsService } from "@/services/predictions";
import type { Language } from "@/types/domain";
import { claimImportedLabel, claimKeptLabel, claimStartedLabel } from "./predictions-copy";
import { getGuestStore, noteServerTime } from "./predictions-runtime";

let inFlight: Promise<void> | null = null;

/**
 * The visitor's picks move to the account at sign-in (plan §4): register,
 * log-in and Google alike, because it runs whenever a session appears. What
 * the account took leaves the phone; a pick refused because its match had
 * started stays, marked "non comptabilisé". One message says what happened.
 *
 * When the game is off, or the network fails, nothing leaves the phone and
 * the next sign-in (or load) tries again.
 */
export function claimGuestPredictionsOnSignIn({
  queryClient,
  lang,
  t,
}: {
  queryClient: QueryClient;
  lang: Language;
  t: (key: TranslationKey) => string;
}): Promise<void> {
  if (!PRONOSTICS_ENABLED || inFlight) return inFlight ?? Promise.resolve();
  const store = getGuestStore();
  const items = store.forClaim(store.read().seasonId);
  if (items.length === 0) return Promise.resolve();
  inFlight = predictionsService
    .claimGuest(items)
    .then((result) => {
      noteServerTime(result.serverTime);
      store.applyClaim(result.results);
      void queryClient.invalidateQueries({ queryKey: ["predictions"] });
      const lines = [
        result.imported > 0 ? claimImportedLabel(result.imported, lang, t) : null,
        result.keptExisting > 0 ? claimKeptLabel(result.keptExisting, lang, t) : null,
        result.started > 0 ? claimStartedLabel(result.started, lang, t) : null,
      ].filter((line): line is string => line !== null);
      if (lines.length > 0)
        toast.success(t("predictions.claim.title"), { description: lines.join(" · ") });
    })
    .catch((error: unknown) => {
      // Kept on the phone: switched off, offline or refused, the next
      // sign-in tries again. Nothing to tell the player that they can act on.
      void mapPredictionsError(error);
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}
