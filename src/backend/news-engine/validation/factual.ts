// The factual gate.
//
// Checks the draft against the fact set it was written from. Everything here
// is a mechanical comparison, not a judgement call: it catches the specific
// failures that turn a correct pipeline into a wrong article.
//
// What it will not do is resolve a conflict. Where sources disagree, the
// cluster is flagged and a person decides; inventing a resolution is worse
// than publishing nothing.

import type { ClaimStatus, FactualReport, GeneratedArticle, QualityVerdict } from "../contracts";
import { normalizeArticleText, normalizeEntityName } from "../normalization/text";

/** Wording that asserts an event is settled. */
const OFFICIAL_ASSERTIONS_AR = [
  "رسميا",
  "بشكل رسمي",
  "اعلن رسميا",
  "وقع رسميا",
  "اكد رسميا",
  "بلاغ رسمي",
];
const OFFICIAL_ASSERTIONS_FR = [
  "officiellement",
  "officialise",
  "a officialise",
  "confirme officiellement",
  "communique officiel",
];

/** Hedges that correctly mark an unofficial claim. */
const HEDGES_AR = [
  "بحسب",
  "وفق",
  "تقارير",
  "يقترب",
  "مفاوضات",
  "شائعات",
  "من المرتقب",
  "من المنتظر",
];
const HEDGES_FR = [
  "selon",
  "d apres",
  "rapporte",
  "serait",
  "negociations",
  "rumeur",
  "proche de",
  "devrait",
];

export interface FactualCheckInput {
  readonly article: GeneratedArticle;
  readonly bestClaimStatus: ClaimStatus;
  readonly score: { readonly home: number; readonly away: number } | null;
  readonly eventType: string;
  /** Canonical names of entities the article is allowed to name as subjects. */
  readonly knownTeamNames: readonly string[];
  readonly knownPlayerNames: readonly string[];
  readonly hasConflict: boolean;
  readonly conflictSummary: string | null;
  readonly unresolvedCount: number;
}

function containsAny(haystack: string, needles: readonly string[]): string | null {
  for (const needle of needles) {
    const normalized = normalizeEntityName(needle);
    if (normalized && haystack.includes(normalized)) return needle;
  }
  return null;
}

/** Digit pairs in "2-1" / "2:1" / "٢-١" form. */
function scoresIn(text: string): string[] {
  const matches: string[] = [];
  for (const match of text.matchAll(/(\d{1,2})\s*[-:–]\s*(\d{1,2})/gu)) {
    matches.push(`${match[1]}-${match[2]}`);
  }
  return matches;
}

/**
 * Runs the factual gate over one generated edition.
 *
 * Verdicts:
 *   * `rejected` — the article asserts something the facts do not support.
 *   * `needs_review` — a person must look before this is published.
 *   * `passed` — consistent with the fact set.
 */
export function assessFactualQuality(input: FactualCheckInput): FactualReport {
  const violations: string[] = [];
  const body = normalizeEntityName(
    `${input.article.headline} ${input.article.excerpt} ${normalizeArticleText(input.article.bodyHtml)}`,
  );
  const officialAssertion =
    containsAny(body, OFFICIAL_ASSERTIONS_AR) ?? containsAny(body, OFFICIAL_ASSERTIONS_FR);
  const hedge = containsAny(body, HEDGES_AR) ?? containsAny(body, HEDGES_FR);

  // The central rule: "reported" must never be presented as settled fact.
  if (input.bestClaimStatus !== "official" && officialAssertion) {
    violations.push(
      `The article asserts "${officialAssertion}" but the strongest source claim is "${input.bestClaimStatus}".`,
    );
  }
  if (
    (input.bestClaimStatus === "reported" ||
      input.bestClaimStatus === "rumour" ||
      input.bestClaimStatus === "disputed") &&
    !hedge
  ) {
    violations.push(
      `The strongest source claim is "${input.bestClaimStatus}" but the article carries no attribution or hedging.`,
    );
  }

  // A scoreline the facts do not contain is either invented or transcribed
  // wrongly; both are unpublishable.
  const bodyScores = scoresIn(normalizeArticleText(input.article.bodyHtml));
  if (input.score) {
    const expected = `${input.score.home}-${input.score.away}`;
    if (bodyScores.length > 0 && !bodyScores.includes(expected)) {
      violations.push(
        `The article states a score of ${bodyScores[0]} but the extracted result is ${expected}.`,
      );
    }
  } else if (input.eventType === "match_result" && bodyScores.length > 0) {
    violations.push("The article states a score that no source provided.");
  }

  if (input.hasConflict) {
    return {
      verdict: "needs_review",
      reason: input.conflictSummary
        ? `Sources conflict and the pipeline must not choose between them: ${input.conflictSummary}`
        : "Sources conflict; a human must resolve this before publication.",
      violations,
    };
  }

  if (violations.length > 0) {
    return {
      verdict: "rejected",
      reason: violations[0] as string,
      violations,
    };
  }

  if (input.unresolvedCount > 0) {
    return {
      verdict: "needs_review",
      reason: `${input.unresolvedCount} entity mention(s) did not resolve to the football catalog.`,
      violations,
    };
  }

  if (input.knownTeamNames.length + input.knownPlayerNames.length === 0) {
    return {
      verdict: "needs_review",
      reason: "No club or player resolved for this story, so it cannot be filed under any entity.",
      violations,
    };
  }

  return {
    verdict: "passed",
    reason: "Article is consistent with the extracted facts and their claim statuses.",
    violations,
  };
}

/** Combines both gates into the verdict recorded against the attempt. */
export function combineVerdicts(
  originality: QualityVerdict,
  factual: QualityVerdict,
): QualityVerdict {
  const order: QualityVerdict[] = ["passed", "needs_review", "needs_regeneration", "rejected"];
  const worst = Math.max(order.indexOf(originality), order.indexOf(factual));
  return order[worst] ?? "needs_review";
}
