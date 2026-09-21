// BotolaGO article composition.
//
// Input: a fact set and the canonical names of the entities it resolved to.
// Output: an original article for one language.
//
// Two constraints shape everything here:
//
//   1. The generator never receives source prose. It receives claims, quotes,
//      names and dates. There is no path by which a source sentence can be
//      rewritten into a BotolaGO sentence, because the source sentence is not
//      in the prompt.
//   2. Arabic and French are generated independently from the same facts,
//      never by translating one into the other. Translation compounds any
//      error in the first edition and produces stilted copy in the second.

import { z } from "zod";

import {
  type ClaimStatus,
  type GeneratedArticle,
  type NewsEngineLanguage,
  NewsEngineError,
} from "../contracts";
import type { ClusterBundle } from "../gateway/contracts";
import type { NewsLanguageModel } from "../llm/model";
import { slugify } from "../normalization/text";

export const PROMPT_VERSION = "compose-v1";

/** Category slugs the taxonomy seed guarantees exist. */
export const CATEGORY_SLUGS = [
  "latest",
  "transfers",
  "match-reports",
  "botola-pro",
  "national-team",
  "continental",
  "analysis",
  "interviews",
] as const;

export const TAG_SLUGS = [
  "injuries",
  "suspensions",
  "coaching",
  "official-announcement",
  "fixtures",
  "throne-cup",
] as const;

export const generatedArticleSchema = z.object({
  headline: z.string().min(10).max(200),
  slug_hint: z
    .string()
    .min(3)
    .max(90)
    .describe("Lowercase Latin words separated by hyphens, describing the story in English."),
  excerpt: z.string().min(40).max(320),
  body_html: z
    .string()
    .min(400)
    .max(20_000)
    .describe("Only <p>, <h2>, <h3>, <ul>, <ol>, <li>, <blockquote>, <strong>, <em> tags."),
  category: z.enum(CATEGORY_SLUGS),
  tags: z.array(z.enum(TAG_SLUGS)).max(4),
  seo_title: z.string().min(10).max(70),
  meta_description: z.string().min(50).max(170),
  og_title: z.string().min(10).max(90),
  og_description: z.string().min(50).max(200),
});

export type RawGeneratedArticle = z.infer<typeof generatedArticleSchema>;

const LANGUAGE_GUIDANCE: Readonly<Record<NewsEngineLanguage, string>> = {
  ar: `Write in Modern Standard Arabic as used by Moroccan sports desks. Use the Arabic club and player names given in the entity list, not transliterations of the Latin spellings. Use Moroccan month names where the source region expects them (شتنبر, أكتوبر, نونبر, دجنبر). Numerals in Western Arabic digits.`,
  fr: `Write in French as used by Moroccan sports desks. Use the French club and player names given in the entity list. Keep accents correct. Numerals in Western digits.`,
};

const ATTRIBUTION_GUIDANCE: Readonly<Record<ClaimStatus, string>> = {
  official:
    "The event is officially announced. State it directly, and name the body that announced it.",
  confirmed:
    "The event is confirmed by named parties but not by a formal announcement. Attribute it to who confirmed it.",
  reported:
    "This is reporting, not an announcement. Every substantive claim must be attributed ('According to…', 'حسب…', 'Selon…'). Do not write as though it were settled.",
  rumour:
    "This is speculation. Say so explicitly, attribute it, and do not imply a decision has been made.",
  disputed:
    "Sources disagree. Present what each says and attribute both. Do not choose between them.",
};

const SYSTEM_PROMPT = `You are a staff football writer for BotolaGO, a Moroccan football publication.

You write ORIGINAL articles from a structured fact set. You will never be shown the source articles those facts came from, and you must not attempt to reconstruct their wording. Your job is journalism, not paraphrase.

Absolute rules:

1. Write only what the fact set supports. Do not add context, history, standings, statistics, transfer fees, contract lengths or background you were not given — not even if you believe it is true.
2. Respect every claim's status. A claim marked "reported" or "rumour" must be attributed and hedged in your prose. Never present it as settled. A claim marked "official" may be stated directly.
3. Quotations may be reproduced exactly as supplied, in their original language, with the speaker named. Do not invent, extend, translate or paraphrase a quote.
4. Use the canonical club and player names supplied in the entity list. Those are the names BotolaGO's database uses and the ones readers expect.
5. Write for a reader who wants the news, not a warm-up. Open with what happened. No "In a stunning development", no "Football fans around the world", no rhetorical questions, no closing paragraph that summarises what you just said.
6. Length follows substance. A three-fact story is four short paragraphs. Do not pad to reach a length.
7. body_html uses only these tags: <p>, <h2>, <h3>, <ul>, <ol>, <li>, <blockquote>, <strong>, <em>. No links, no images, no attributes of any kind, no inline styles.
8. The headline states what happened. It is not a teaser and it does not ask a question.
9. slug_hint is always lowercase English words with hyphens, whatever the article's language, because it becomes part of a URL.

You are writing for people who follow Botola Pro closely. Be precise, be brief, and be accurate about how certain each thing is.`;

export interface CompositionInput {
  readonly bundle: ClusterBundle;
  readonly language: NewsEngineLanguage;
  /** Feedback from a previous attempt's gates, for a regeneration pass. */
  readonly retryGuidance?: string | null;
}

interface FactLine {
  readonly text: string;
  readonly status: ClaimStatus;
}

/** Deduplicated claims across the cluster, strongest status per claim kept. */
export function mergeClaims(bundle: ClusterBundle): FactLine[] {
  const byText = new Map<string, FactLine>();
  const rank: Record<ClaimStatus, number> = {
    rumour: 0,
    disputed: 1,
    reported: 2,
    confirmed: 3,
    official: 4,
  };
  for (const item of bundle.items) {
    for (const claim of item.facts?.claims ?? []) {
      const key = claim.text.trim().toLowerCase();
      const existing = byText.get(key);
      if (!existing || rank[claim.status] > rank[existing.status]) {
        byText.set(key, { text: claim.text.trim(), status: claim.status });
      }
    }
  }
  return [...byText.values()].sort((left, right) => rank[right.status] - rank[left.status]);
}

export function buildCompositionPrompt(input: CompositionInput): string {
  const { bundle, language } = input;
  const claims = mergeClaims(bundle);
  const quotes = bundle.items.flatMap((item) => item.facts?.quotes ?? []);
  const attributions = bundle.items
    .map(
      (item) => `${item.sourceName} (${item.sourceKind}, ${item.sourcePublishedAt ?? "undated"})`,
    )
    .filter((value, index, all) => all.indexOf(value) === index);

  const lines: string[] = [
    `Language to write in: ${language}`,
    LANGUAGE_GUIDANCE[language],
    "",
    `Event type: ${bundle.cluster.eventType}`,
    `Event date: ${bundle.cluster.eventDate ?? "not stated"}`,
    `Strongest claim status across sources: ${bundle.cluster.bestClaimStatus}`,
    ATTRIBUTION_GUIDANCE[bundle.cluster.bestClaimStatus],
    `Number of independent sources reporting this: ${bundle.cluster.sourceCount}`,
    "",
  ];

  if (bundle.competition) {
    const localized = bundle.competition.translations[language] ?? bundle.competition.name;
    lines.push(`Competition: ${localized} (canonical: ${bundle.competition.name})`);
  }

  if (bundle.teams.length > 0) {
    lines.push("", "Clubs (use these names):");
    for (const team of bundle.teams) {
      const alternates = team.aliases.slice(0, 6).join(" / ");
      lines.push(`  - ${team.name}${alternates ? ` — also written: ${alternates}` : ""}`);
    }
  }
  if (bundle.players.length > 0) {
    lines.push("", "Players (use these names):");
    for (const player of bundle.players) {
      lines.push(`  - ${player.displayName} (${player.fullName}, ${player.position})`);
    }
  }

  const score = bundle.items.find((item) => item.facts?.score)?.facts?.score;
  if (score) lines.push("", `Final score: ${score.home}-${score.away}`);

  lines.push("", "Facts, with the confidence each source gave them:");
  for (const claim of claims) {
    lines.push(`  - [${claim.status}] ${claim.text}`);
  }

  if (quotes.length > 0) {
    lines.push("", "Quotations available (reproduce exactly, attribute to the named speaker):");
    for (const quote of quotes.slice(0, 10)) {
      lines.push(`  - ${quote.speaker}: "${quote.text}"`);
    }
  }

  lines.push(
    "",
    `Reporting attribution available if you need it: ${attributions.join("; ")}`,
    "Refer to reporting generically ('according to Moroccan reports') or by publisher name where it matters editorially. Never present another publication's wording as your own.",
  );

  if (bundle.cluster.hasConflict && bundle.cluster.conflictSummary) {
    lines.push(
      "",
      `SOURCES CONFLICT: ${bundle.cluster.conflictSummary}`,
      "Present both accounts and attribute each. Do not resolve the conflict.",
    );
  }

  if (input.retryGuidance) {
    lines.push(
      "",
      "A previous attempt was rejected by BotolaGO's quality gates. Fix this specifically:",
      input.retryGuidance,
    );
  }

  return lines.join("\n");
}

function normalizeSlug(hint: string, language: NewsEngineLanguage, clusterKey: string): string {
  const base = slugify(hint, 70);
  // A cluster suffix keeps two same-day stories about one club apart, and it
  // makes the slug reproducible for the idempotent republish path.
  const suffix = clusterKey.slice(clusterKey.indexOf(":") + 1, clusterKey.indexOf(":") + 9);
  const prefix = base || "botolago-story";
  return `${prefix}-${language}-${suffix}`.slice(0, 180).replace(/-+$/u, "");
}

/** Generates one language edition from the cluster's facts. */
export async function composeArticle(
  model: NewsLanguageModel,
  input: CompositionInput,
): Promise<{ article: GeneratedArticle; raw: RawGeneratedArticle; model: string }> {
  const claims = mergeClaims(input.bundle);
  if (claims.length === 0) {
    throw new NewsEngineError(
      "news_engine_generation_no_facts",
      "The cluster has no extracted claims to write from.",
    );
  }

  const result = await model.complete({
    system: SYSTEM_PROMPT,
    user: buildCompositionPrompt(input),
    schema: generatedArticleSchema,
    schemaName: "botolago_article",
    maxTokens: 12_000,
    effort: "high",
  });

  const raw = result.value;
  return {
    raw,
    model: result.model,
    article: {
      language: input.language,
      headline: raw.headline.trim(),
      slug: normalizeSlug(raw.slug_hint, input.language, input.bundle.cluster.clusterKey),
      excerpt: raw.excerpt.trim(),
      bodyHtml: raw.body_html.trim(),
      category: raw.category,
      tags: raw.tags,
      seoTitle: raw.seo_title.trim(),
      metaDescription: raw.meta_description.trim(),
      openGraphTitle: raw.og_title.trim(),
      openGraphDescription: raw.og_description.trim(),
    },
  };
}
