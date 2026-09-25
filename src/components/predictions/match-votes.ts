import {
  MATCH_VOTE_CHOICES,
  type MatchVoteChoice,
  type MatchVoteQuestion,
  type MatchVoteQuestionDto,
  type OpenMatchVotesDto,
} from "@/backend/predictions/contracts";
import type { Language } from "@/types/domain";

/**
 * The fan votes on a match page (20260925234000): who wins, will both teams
 * score, who scores first. For fun: no points, only the share of fans behind
 * each answer.
 */

/**
 * Whole percentages that add up to exactly 100 (largest remainder: the
 * answers that lost the most to rounding get the missing points, ties to the
 * first). All zero when nobody has voted.
 */
export function votePercentages(counts: readonly number[]): number[] {
  const total = counts.reduce((sum, count) => sum + count, 0);
  if (total <= 0) return counts.map(() => 0);
  const exact = counts.map((count) => (count * 100) / total);
  const shares = exact.map((value) => Math.floor(value));
  let missing = 100 - shares.reduce((sum, share) => sum + share, 0);
  const byRemainder = exact
    .map((value, index) => ({ index, remainder: value - shares[index]! }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (const { index } of byRemainder) {
    if (missing <= 0) break;
    shares[index]! += 1;
    missing -= 1;
  }
  return shares;
}

export interface VoteOptionView {
  readonly choice: MatchVoteChoice;
  readonly count: number;
  readonly percent: number;
  readonly mine: boolean;
}

export interface VoteQuestionView {
  readonly question: MatchVoteQuestion;
  readonly options: readonly VoteOptionView[];
  readonly total: number;
  readonly mine: MatchVoteChoice | null;
}

/**
 * One question as its card shows it. A visitor's vote lives on the phone and
 * is not in the database's totals yet, so it is added here: the visitor sees
 * the shares with their vote in, as everyone will once they sign in.
 */
export function questionView(
  dto: MatchVoteQuestionDto,
  phoneChoice: MatchVoteChoice | null = null,
): VoteQuestionView {
  const choices = MATCH_VOTE_CHOICES[dto.question] as readonly MatchVoteChoice[];
  const saved = dto.mine as MatchVoteChoice | null;
  const mine = saved ?? phoneChoice;
  const tallies = dto.counts as Readonly<Record<string, number>>;
  const counts = choices.map(
    (choice) => (tallies[choice] ?? 0) + (saved === null && phoneChoice === choice ? 1 : 0),
  );
  const percents = votePercentages(counts);
  return {
    question: dto.question,
    options: choices.map((choice, index) => ({
      choice,
      count: counts[index]!,
      percent: percents[index]!,
      mine: mine === choice,
    })),
    total: counts.reduce((sum, count) => sum + count, 0),
    mine,
  };
}

/** The answer as it will read once the database has the vote: moved from the old choice. */
export function withMyVote(
  votes: OpenMatchVotesDto,
  question: MatchVoteQuestion,
  choice: MatchVoteChoice,
): OpenMatchVotesDto {
  return {
    ...votes,
    questions: votes.questions.map((entry) => {
      if (entry.question !== question) return entry;
      const counts: Record<string, number> = { ...entry.counts };
      if (entry.mine) counts[entry.mine] = Math.max(0, (counts[entry.mine] ?? 0) - 1);
      counts[choice] = (counts[choice] ?? 0) + 1;
      return { ...entry, counts, mine: choice } as MatchVoteQuestionDto;
    }),
  };
}

/** "56 %" in French, the Arabic page's own spelling in Arabic. */
export function formatShare(percent: number, lang: Language): string {
  return new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-FR", {
    style: "percent",
    maximumFractionDigits: 0,
  }).format(percent / 100);
}
