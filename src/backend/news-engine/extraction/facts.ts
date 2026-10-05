// Fact extraction.
//
// This is the stage that makes BotolaGO's output original. Source prose goes
// in; a structured fact set comes out; the generator only ever sees the fact
// set. There is no path from a source sentence to a published sentence.
//
// The claim-status vocabulary is the other half of the contract. Every factual
// statement carries the confidence the *source* gave it, and nothing
// downstream may promote it. "Reported" does not become "confirmed" because
// the article reads confidently.

import { z } from "zod";

import {
  CLAIM_STATUS_RANK,
  type ClaimStatus,
  type ExtractedFacts,
  type NewsSourceLanguage,
  NewsEngineError,
} from "../contracts";
import type { NewsLanguageModel } from "../llm/model";

export const EXTRACTOR_VERSION = "facts-v1";

/** Closed set. A new type needs a publication policy row alongside it. */
export const EVENT_TYPES = [
  "match_result",
  "fixture_announcement",
  "official_signing",
  "transfer_rumour",
  "contract_renewal",
  "injury",
  "suspension",
  "coach_change",
  "club_statement",
  "competition_announcement",
  "preview",
  "analysis",
  "other",
] as const;

export const factsSchema = z.object({
  event_type: z.enum(EVENT_TYPES),
  event_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/u)
    .nullable()
    .describe("ISO date of the event the article reports, not the publication date."),
  competition: z.string().nullable().describe("Competition name exactly as the source writes it."),
  clubs: z
    .array(z.string())
    .max(16)
    .describe("Club names exactly as written in the source, no translation, no expansion."),
  players: z.array(z.string()).max(32).describe("Player names exactly as written in the source."),
  score: z
    .object({ home: z.number().int().min(0).max(30), away: z.number().int().min(0).max(30) })
    .nullable()
    .describe("Only for a finished match whose final score the source states."),
  claims: z
    .array(
      z.object({
        text: z
          .string()
          .min(3)
          .max(400)
          .describe("One factual assertion, restated plainly in English, not copied."),
        status: z.enum(["official", "confirmed", "reported", "rumour", "disputed"]),
        confidence: z.number().min(0).max(1),
      }),
    )
    .min(1)
    .max(40),
  quotes: z
    .array(
      z.object({
        speaker: z.string().min(2).max(120),
        text: z.string().min(3).max(600),
        attribution: z.string().max(200).nullable(),
      }),
    )
    .max(20)
    .describe("Direct quotations only, in the language they were given in."),
  summary: z.string().min(20).max(600).describe("Two or three factual sentences in English."),
});

export type RawFacts = z.infer<typeof factsSchema>;

const SYSTEM_PROMPT = `You are the fact-extraction stage of a Moroccan football newsroom's editorial pipeline.

Your job is to read one source article and return the verifiable facts it contains as structured data. A separate stage will later write an original article from your output. That stage never sees the source text, so your extraction is the only bridge — but it must be a bridge for FACTS, not for PROSE.

Rules:

1. Extract facts, never phrasing. Restate every claim plainly in English in your own words. Do not copy or lightly reword the source's sentences. Facts are not owned by anyone; sentences are.
2. Direct quotations are the one exception: capture them verbatim in their original language, with the speaker named. If you cannot identify who said it, do not record it as a quote.
3. Assign every claim the confidence the SOURCE gives it, never your own:
   - "official": the club, federation, league or competition organiser has formally announced it, or the source publishes their statement.
   - "confirmed": multiple named parties or an authoritative outlet state it as fact.
   - "reported": a single outlet or a named journalist reports it.
   - "rumour": presented as speculation, "according to sources", or with hedging.
   - "disputed": the source itself notes a contradiction or a denial.
   Never upgrade a status because the writing sounds confident. A club "expected to sign" is a rumour, not an official signing.
4. Names go in exactly as the source writes them, in the source's script. Do not translate, transliterate, expand abbreviations, or correct spelling. A later stage maps them to the club and player database.
5. event_date is the date of the EVENT, not the publication date. If the article gives no event date, return null.
6. score is only for a match that has finished and whose final score the source states.
7. If the article contains no verifiable factual claim — pure opinion, a listicle, a preview with no new information — return event_type "analysis" or "preview" with the claims you can support, and keep confidence low.
8. Never add anything the source does not say. No background you happen to know, no inferred transfer fees, no assumed competitions.`;

export interface ExtractionInput {
  readonly title: string | null;
  readonly text: string;
  readonly language: NewsSourceLanguage;
  readonly publishedAt: string | null;
  readonly sourceName: string;
  readonly sourceKind: string;
}

/** Strongest status present; the cluster and the publication policy use it. */
export function strongestClaimStatus(claims: ReadonlyArray<{ status: ClaimStatus }>): ClaimStatus {
  let best: ClaimStatus = "rumour";
  for (const claim of claims) {
    if (CLAIM_STATUS_RANK[claim.status] > CLAIM_STATUS_RANK[best]) best = claim.status;
  }
  return best;
}

export function buildExtractionPrompt(input: ExtractionInput): string {
  return [
    `Source publisher: ${input.sourceName} (${input.sourceKind})`,
    `Source language: ${input.language}`,
    `Published: ${input.publishedAt ?? "unknown"}`,
    "",
    `Headline: ${input.title ?? "(none)"}`,
    "",
    "Article text:",
    input.text,
  ].join("\n");
}

/**
 * Extracts the fact set for one source article.
 *
 * `article_fetch` guarantees the text is already bounded, so the only limit
 * applied here is a defensive truncation well above any real article length.
 */
export async function extractFacts(
  model: NewsLanguageModel,
  input: ExtractionInput,
): Promise<{ facts: ExtractedFacts; raw: RawFacts; model: string }> {
  if (input.text.trim().length < 80) {
    throw new NewsEngineError(
      "news_engine_extraction_input_too_short",
      "Source text is too short to extract facts from.",
    );
  }

  const result = await model.complete({
    system: SYSTEM_PROMPT,
    user: buildExtractionPrompt({ ...input, text: input.text.slice(0, 60_000) }),
    schema: factsSchema,
    schemaName: "extracted_facts",
    maxTokens: 8_000,
    effort: "medium",
  });

  const raw = result.value;
  const claims = raw.claims.map((claim) => ({
    text: claim.text,
    status: claim.status,
    confidence: claim.confidence,
  }));

  const facts: ExtractedFacts = {
    eventType: raw.event_type,
    eventDate: raw.event_date,
    competitionMention: raw.competition,
    teamMentions: raw.clubs.filter((club) => club.trim().length > 1),
    playerMentions: raw.players.filter((player) => player.trim().length > 1),
    score: raw.score,
    claims,
    quotes: raw.quotes.map((quote) => ({
      speaker: quote.speaker,
      text: quote.text,
      attribution: quote.attribution,
    })),
    bestClaimStatus: strongestClaimStatus(claims),
    confidence:
      claims.length === 0
        ? 0
        : claims.reduce((total, claim) => total + claim.confidence, 0) / claims.length,
  };

  return { facts, raw, model: result.model };
}
