import type { QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import type { MatchVoteInput } from "@/backend/predictions/contracts";
import { mapPredictionsError } from "@/backend/predictions/errors";
import {
  forgetGuestVotes,
  guestVoteItems,
  readGuestVotes,
} from "@/backend/predictions/guest-votes";
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

/** Matches whose phone votes are sent at sign-in; older ones have long kicked off. */
const SENT_VOTE_MATCHES = 20;
let votesInFlight: Promise<void> | null = null;

/**
 * A visitor's match votes move to the account at sign-in, like their picks:
 * each is cast as the account's own vote. A vote refused for good (the match
 * has kicked off, or is not one Pronostics covers) leaves the phone too; when
 * the game is off or the network fails, the rest stay for the next sign-in.
 * Votes on the oldest matches are dropped unsent: those have kicked off.
 */
export function sendGuestVotesOnSignIn(queryClient: QueryClient): Promise<void> {
  if (!PRONOSTICS_ENABLED || votesInFlight) return votesInFlight ?? Promise.resolve();
  const state = readGuestVotes();
  const matchIds = Object.keys(state);
  if (matchIds.length === 0) return Promise.resolve();
  const recent = new Set(matchIds.slice(-SENT_VOTE_MATCHES));
  const items = guestVoteItems(state);
  votesInFlight = (async () => {
    const settled: MatchVoteInput[] = items.filter((item) => !recent.has(item.fixtureId));
    for (const item of items.filter((candidate) => recent.has(candidate.fixtureId))) {
      try {
        await predictionsService.castMatchVote(item);
        settled.push(item);
      } catch (error) {
        const { code } = mapPredictionsError(error);
        const final =
          code === "match_vote_closed" ||
          code === "match_vote_unavailable" ||
          code === "validation_failed" ||
          code === "account_banned";
        if (!final) break;
        settled.push(item);
      }
    }
    forgetGuestVotes(settled);
    void queryClient.invalidateQueries({ queryKey: ["predictions", "match-votes"] });
  })().finally(() => {
    votesInFlight = null;
  });
  return votesInFlight;
}
