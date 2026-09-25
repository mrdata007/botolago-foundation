import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import type {
  MatchVoteChoice,
  MatchVoteQuestion,
  MatchVotesDto,
} from "@/backend/predictions/contracts";
import { mapPredictionsError, type PredictionsError } from "@/backend/predictions/errors";
import {
  readGuestVotes,
  writeGuestVote,
  type GuestMatchVotes,
} from "@/backend/predictions/guest-votes";
import { useAuth } from "@/auth/AuthProvider";
import { useI18n } from "@/i18n/provider";
import { predictionsService } from "@/services/predictions";
import { withMyVote } from "./match-votes";
import { noteServerTime } from "./predictions-runtime";

export function matchVotesKey(fixtureId: string, uid: string) {
  return ["predictions", "match-votes", fixtureId, uid || "visitor"] as const;
}

/**
 * The fan votes on one match: the database's totals, the player's own votes
 * (on the account, or on the phone for a visitor), and a way to vote. A
 * signed-in vote shows at once and is put back if the database refuses it.
 */
export function useMatchVotes(fixtureId: string) {
  const { t } = useI18n();
  const { status, user } = useAuth();
  const uid = status === "authenticated" ? (user?.id ?? "") : "";
  const queryClient = useQueryClient();

  const query = useQuery<MatchVotesDto, PredictionsError>({
    queryKey: matchVotesKey(fixtureId, uid),
    queryFn: async ({ signal }) => {
      const votes = await predictionsService.matchVotes(fixtureId, signal);
      noteServerTime(votes.serverTime);
      return votes;
    },
    staleTime: 60_000,
    retry: 1,
  });

  // The phone's votes are read after mount: the server's render has none.
  const [phone, setPhone] = useState<GuestMatchVotes>({});
  useEffect(() => {
    setPhone(readGuestVotes()[fixtureId] ?? {});
  }, [fixtureId]);

  const cast = useCallback(
    async (question: MatchVoteQuestion, choice: MatchVoteChoice) => {
      const key = matchVotesKey(fixtureId, uid);
      const current = queryClient.getQueryData<MatchVotesDto>(key);
      if (!current?.allowed || !current.open) return;
      if (!uid) {
        setPhone(writeGuestVote(fixtureId, question, choice)[fixtureId] ?? {});
        return;
      }
      queryClient.setQueryData<MatchVotesDto>(key, withMyVote(current, question, choice));
      try {
        const next = await predictionsService.castMatchVote({ fixtureId, question, choice });
        noteServerTime(next.serverTime);
        queryClient.setQueryData<MatchVotesDto>(key, next);
      } catch (error) {
        queryClient.setQueryData<MatchVotesDto>(key, current);
        const closed = mapPredictionsError(error).code === "match_vote_closed";
        toast.error(closed ? t("predictions.votes.closed_error") : t("predictions.votes.error"));
        if (closed) void queryClient.invalidateQueries({ queryKey: key });
      }
    },
    [fixtureId, queryClient, t, uid],
  );

  return { votes: query.data, uid, phone, cast };
}
