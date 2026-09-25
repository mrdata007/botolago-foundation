import {
  useMutation,
  useQuery,
  useQueryClient,
  type MutationOptions,
  type QueryClient,
} from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import type {
  MatchVoteChoice,
  MatchVoteInput,
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

export interface VoteTap {
  readonly question: MatchVoteQuestion;
  readonly choice: MatchVoteChoice;
}

/**
 * How a signed-in player's vote reaches the database. It shows at once. Votes
 * go one at a time, in the order they were tapped, so the last tap on a
 * question is the one kept. What is on screen is replaced by the database's
 * answer only when the last vote is back: an earlier answer, or an earlier
 * refusal, never undoes a later tap. After a refusal the votes are read again.
 */
export function matchVoteMutationOptions({
  queryClient,
  fixtureId,
  uid,
  send,
  refused,
}: {
  queryClient: QueryClient;
  fixtureId: string;
  uid: string;
  send: (input: MatchVoteInput) => Promise<MatchVotesDto>;
  refused: (error: unknown) => void;
}): MutationOptions<MatchVotesDto, unknown, VoteTap> {
  const key = matchVotesKey(fixtureId, uid);
  const mutationKey = ["predictions", "match-vote", fixtureId, uid];
  return {
    mutationKey,
    scope: { id: `match-vote:${fixtureId}:${uid}` },
    mutationFn: ({ question, choice }) => send({ fixtureId, question, choice }),
    onMutate: async ({ question, choice }) => {
      // A read already on its way would land on top of the tap.
      await queryClient.cancelQueries({ queryKey: key });
      queryClient.setQueryData<MatchVotesDto>(key, (current) =>
        current?.allowed && current.open ? withMyVote(current, question, choice) : current,
      );
    },
    onSuccess: (next) => noteServerTime(next.serverTime),
    onError: refused,
    onSettled: (next, error) => {
      // This vote still counts itself; more means later taps are on their way.
      if (queryClient.isMutating({ mutationKey }) > 1) return;
      if (next && !error) queryClient.setQueryData<MatchVotesDto>(key, next);
      else void queryClient.invalidateQueries({ queryKey: key });
    },
  };
}

/**
 * The fan votes on one match: the database's totals, the player's own votes
 * (on the account, or on the phone for a visitor), and a way to vote.
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

  const { mutate } = useMutation(
    matchVoteMutationOptions({
      queryClient,
      fixtureId,
      uid,
      send: (input) => predictionsService.castMatchVote(input),
      refused: (error) => {
        const closed = mapPredictionsError(error).code === "match_vote_closed";
        // One message for a run of refused taps.
        toast.error(closed ? t("predictions.votes.closed_error") : t("predictions.votes.error"), {
          id: `match-vote-error:${fixtureId}`,
        });
      },
    }),
  );

  const cast = useCallback(
    (question: MatchVoteQuestion, choice: MatchVoteChoice) => {
      const current = queryClient.getQueryData<MatchVotesDto>(matchVotesKey(fixtureId, uid));
      if (!current?.allowed || !current.open) return;
      if (!uid) {
        setPhone(writeGuestVote(fixtureId, question, choice)[fixtureId] ?? {});
        return;
      }
      mutate({ question, choice });
    },
    [fixtureId, mutate, queryClient, uid],
  );

  return { votes: query.data, uid, phone, cast };
}
