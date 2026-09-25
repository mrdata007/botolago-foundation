import { describe, expect, test } from "bun:test";
import { MutationObserver, QueryClient } from "@tanstack/react-query";

import type {
  MatchVoteChoice,
  MatchVoteInput,
  MatchVoteQuestion,
  MatchVotesDto,
  OpenMatchVotesDto,
} from "@/backend/predictions/contracts";
import { withMyVote } from "./match-votes";
import { matchVoteMutationOptions, matchVotesKey } from "./use-match-votes";

const FIXTURE = "00000020-0000-4000-8000-000000000001";
const UID = "00000000-0000-4000-8000-0000000000aa";

const start: OpenMatchVotesDto = {
  schemaVersion: 1,
  allowed: true,
  serverTime: "2026-09-25T15:00:00.000Z",
  fixtureId: FIXTURE,
  covered: true,
  open: true,
  questions: [
    { question: "winner", counts: { home: 5, draw: 2, away: 3 }, mine: null },
    { question: "both_score", counts: { yes: 1, no: 0 }, mine: null },
    { question: "first_goal", counts: { home: 0, none: 0, away: 0 }, mine: null },
  ],
};

/** The database's answer once it holds these votes of the player's. */
function saved(votes: ReadonlyArray<readonly [MatchVoteQuestion, MatchVoteChoice]>) {
  return votes.reduce<OpenMatchVotesDto>(
    (dto, [question, choice]) => withMyVote(dto, question, choice),
    { ...start, serverTime: "2026-09-25T15:00:01.000Z" },
  );
}

interface Reply {
  readonly input: MatchVoteInput;
  readonly answer: (dto: MatchVotesDto) => void;
  readonly refuse: (error: unknown) => void;
}

/** A player on a match page, and the database's replies, which the test sends when it likes. */
function matchPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const key = matchVotesKey(FIXTURE, UID);
  queryClient.setQueryData(key, start);
  const sent: Reply[] = [];
  const refusals: unknown[] = [];
  const observer = new MutationObserver(
    queryClient,
    matchVoteMutationOptions({
      queryClient,
      fixtureId: FIXTURE,
      uid: UID,
      send: (input) =>
        new Promise<MatchVotesDto>((answer, refuse) => sent.push({ input, answer, refuse })),
      refused: (error) => refusals.push(error),
    }),
  );
  return {
    queryClient,
    key,
    sent,
    refusals,
    tap: (question: MatchVoteQuestion, choice: MatchVoteChoice) => {
      void observer.mutate({ question, choice }).catch(() => undefined);
    },
    onScreen: () => queryClient.getQueryData<MatchVotesDto>(key),
    mine: () =>
      (queryClient.getQueryData<MatchVotesDto>(key) as OpenMatchVotesDto).questions.map(
        (entry) => entry.mine,
      ),
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("a signed-in player's votes on a match page", () => {
  test("show at once, go one at a time, and a slow first answer does not undo the next tap", async () => {
    const page = matchPage();
    page.tap("winner", "home");
    page.tap("both_score", "yes");
    await settle();
    expect(page.mine()).toEqual(["home", "yes", null]);
    expect(page.sent.map((reply) => reply.input.question)).toEqual(["winner"]);

    page.sent[0]!.answer(saved([["winner", "home"]]));
    await settle();
    // The first answer does not know the second tap yet: the screen keeps it.
    expect(page.mine()).toEqual(["home", "yes", null]);
    expect(page.sent.map((reply) => reply.input.question)).toEqual(["winner", "both_score"]);

    const last = saved([
      ["winner", "home"],
      ["both_score", "yes"],
    ]);
    page.sent[1]!.answer(last);
    await settle();
    expect(page.onScreen()).toEqual(last);
  });

  test("two taps on one question reach the database in the order tapped: the last is kept", async () => {
    const page = matchPage();
    page.tap("winner", "home");
    page.tap("winner", "away");
    await settle();
    expect(page.mine()[0]).toBe("away");

    page.sent[0]!.answer(saved([["winner", "home"]]));
    await settle();
    expect(page.mine()[0]).toBe("away");
    expect(page.sent.map((reply) => reply.input.choice)).toEqual(["home", "away"]);

    page.sent[1]!.answer(saved([["winner", "away"]]));
    await settle();
    expect(page.mine()[0]).toBe("away");
  });

  test("a refused vote does not undo a later tap; the last answer shows what was kept", async () => {
    const page = matchPage();
    page.tap("winner", "home");
    page.tap("both_score", "no");
    await settle();

    page.sent[0]!.refuse(new Error("network"));
    await settle();
    expect(page.refusals).toHaveLength(1);
    expect(page.mine()).toEqual(["home", "no", null]);

    const last = saved([["both_score", "no"]]);
    page.sent[1]!.answer(last);
    await settle();
    expect(page.onScreen()).toEqual(last);
  });

  test("when the last vote is refused, the votes are read again", async () => {
    const page = matchPage();
    page.tap("first_goal", "away");
    await settle();
    page.sent[0]!.refuse(new Error("match_vote_closed"));
    await settle();
    expect(page.refusals).toHaveLength(1);
    expect(page.queryClient.getQueryState(page.key)?.isInvalidated).toBe(true);
  });
});
