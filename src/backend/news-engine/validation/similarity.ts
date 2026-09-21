// The originality gate.
//
// The point of the pipeline is independent composition, not synonym
// replacement. This is the check that enforces it: a draft that reads like the
// source is never published, whatever the rest of the pipeline thinks.
//
// Four complementary measures, because each alone is gameable:
//   * 3-gram overlap catches wholesale reuse of phrasing;
//   * 5-gram overlap catches long copied spans that word swaps would hide;
//   * the longest shared token run catches a single copied paragraph inside
//     an otherwise original article;
//   * sentence-level equality catches a copied lede or a copied closing line.
//
// Direct quotations are exempt. A quote is supposed to match — attributing it
// correctly is the honest thing to do, and penalising it would push the
// generator towards paraphrasing people, which is worse.

import type { QualityVerdict, SimilarityReport } from "../contracts";
import { ngrams, normalizeArticleText, splitSentences, tokenize } from "../normalization/text";

/** Above this, publication is refused outright. */
export const SIMILARITY_REJECT_THRESHOLD = 0.28;
/** Above this, a human decides. */
export const SIMILARITY_REVIEW_THRESHOLD = 0.18;
/** A copied span this long is disqualifying on its own. */
export const MAX_SHARED_RUN_TOKENS = 14;

function jaccard(left: ReadonlySet<string>, right: ReadonlySet<string>): number {
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  const [smaller, larger] = left.size <= right.size ? [left, right] : [right, left];
  for (const value of smaller) {
    if (larger.has(value)) shared += 1;
  }
  // Containment rather than symmetric Jaccard: a short draft lifted whole from
  // a long article must score high, and symmetric Jaccard would hide that
  // behind the length difference.
  return shared / smaller.size;
}

/** Longest run of consecutive tokens the draft shares with the source. */
export function longestSharedRun(
  draftTokens: readonly string[],
  sourceTokens: readonly string[],
): number {
  if (draftTokens.length === 0 || sourceTokens.length === 0) return 0;
  const positions = new Map<string, number[]>();
  sourceTokens.forEach((token, index) => {
    const bucket = positions.get(token);
    if (bucket) bucket.push(index);
    else positions.set(token, [index]);
  });

  let best = 0;
  // Rolling previous-row of the classic LCS-substring table, keyed by the
  // source index, so memory stays O(matches) rather than O(n*m).
  let previous = new Map<number, number>();
  for (const token of draftTokens) {
    const current = new Map<number, number>();
    for (const sourceIndex of positions.get(token) ?? []) {
      const run = (previous.get(sourceIndex - 1) ?? 0) + 1;
      current.set(sourceIndex, run);
      if (run > best) best = run;
    }
    previous = current;
  }
  return best;
}

export interface SimilaritySource {
  readonly itemId: string;
  readonly text: string;
}

export interface SimilarityOptions {
  /** Quotes the draft is allowed to reproduce verbatim. */
  readonly allowedQuotes?: readonly string[];
  readonly rejectThreshold?: number;
  readonly reviewThreshold?: number;
}

function stripQuotes(text: string, quotes: readonly string[]): string {
  let result = text;
  for (const quote of quotes) {
    const trimmed = quote.trim();
    if (trimmed.length < 12) continue;
    result = result.split(trimmed).join(" ");
  }
  return result;
}

/**
 * Scores a draft against every source in its cluster and returns the worst
 * result. Passing against the average would let one copied source hide behind
 * several original ones.
 */
export function assessOriginality(
  draftHtml: string,
  sources: readonly SimilaritySource[],
  options: SimilarityOptions = {},
): SimilarityReport {
  const rejectThreshold = options.rejectThreshold ?? SIMILARITY_REJECT_THRESHOLD;
  const reviewThreshold = options.reviewThreshold ?? SIMILARITY_REVIEW_THRESHOLD;
  const quotes = options.allowedQuotes ?? [];

  const draftText = stripQuotes(normalizeArticleText(draftHtml), quotes);
  const draftTokens = tokenize(draftText);
  const draftTrigrams = new Set(ngrams(draftTokens, 3));
  const draftFiveGrams = new Set(ngrams(draftTokens, 5));
  const draftSentences = new Set(
    splitSentences(draftText).map((sentence) => tokenize(sentence).join(" ")),
  );

  if (draftTokens.length < 30) {
    return {
      maxScore: 1,
      perSource: [],
      verdict: "needs_regeneration",
      reason: "The draft is too short to assess; regeneration required.",
    };
  }

  const perSource: Array<SimilarityReport["perSource"][number]> = [];
  let maxScore = 0;
  let worstRun = 0;

  for (const source of sources) {
    const sourceText = stripQuotes(normalizeArticleText(source.text), quotes);
    const sourceTokens = tokenize(sourceText);
    if (sourceTokens.length < 20) continue;

    const trigramOverlap = jaccard(draftTrigrams, new Set(ngrams(sourceTokens, 3)));
    const fiveGramOverlap = jaccard(draftFiveGrams, new Set(ngrams(sourceTokens, 5)));
    const sharedRun = longestSharedRun(draftTokens, sourceTokens);

    const sourceSentences = new Set(
      splitSentences(sourceText).map((sentence) => tokenize(sentence).join(" ")),
    );
    let sentenceMatches = 0;
    for (const sentence of draftSentences) {
      if (sentence.split(" ").length >= 6 && sourceSentences.has(sentence)) sentenceMatches += 1;
    }

    perSource.push({
      itemId: source.itemId,
      trigramOverlap,
      fiveGramOverlap,
      longestSharedRun: sharedRun,
      sentenceMatches,
    });

    // 5-grams weigh most: incidental 3-gram overlap is unavoidable when two
    // articles describe the same match, but a shared 5-gram is a shared
    // sentence fragment.
    const composite = Math.max(
      trigramOverlap * 0.6 + fiveGramOverlap * 1.4,
      sentenceMatches > 0 ? 0.5 + Math.min(sentenceMatches, 4) * 0.15 : 0,
    );
    if (composite > maxScore) maxScore = composite;
    if (sharedRun > worstRun) worstRun = sharedRun;
  }

  const score = Math.min(1, maxScore);

  if (worstRun >= MAX_SHARED_RUN_TOKENS) {
    return {
      maxScore: Math.max(score, rejectThreshold + 0.01),
      perSource,
      verdict: "needs_regeneration",
      reason: `A ${worstRun}-word span is identical to the source text; the draft reuses source phrasing.`,
    };
  }

  let verdict: QualityVerdict = "passed";
  let reason = `Independent composition confirmed (overlap ${score.toFixed(3)}).`;
  if (score >= rejectThreshold) {
    verdict = "needs_regeneration";
    reason = `Overlap with source material is ${score.toFixed(3)}, above the ${rejectThreshold} rewrite threshold.`;
  } else if (score >= reviewThreshold) {
    verdict = "needs_review";
    reason = `Overlap with source material is ${score.toFixed(3)}, above the ${reviewThreshold} review threshold.`;
  }

  return { maxScore: score, perSource, verdict, reason };
}
