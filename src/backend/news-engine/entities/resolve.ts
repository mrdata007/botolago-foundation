// Entity resolution.
//
// Mentions from the source are matched to canonical BotolaGO ids through the
// alias table, so "الوداد الرياضي", "Wydad AC" and "WAC" all land on one club.
//
// Two rules matter here and both are about not corrupting the football
// catalog: a mention that does not resolve is recorded as unresolved and never
// creates a new club or player, and a low-confidence alias (a two- or
// three-letter code) is only accepted when nothing better matched.

import type { EntityMention, NewsSourceLanguage, ResolvedEntities } from "../contracts";
import { normalizeEntityName } from "../normalization/text";
import type { EntityResolution, NewsEngineGateway } from "../gateway/contracts";

/** Below this, a match is a guess rather than a resolution. */
export const MINIMUM_ALIAS_CONFIDENCE = 0.6;

export interface ResolveInput {
  readonly teamMentions: readonly string[];
  readonly playerMentions: readonly string[];
  readonly competitionMention: string | null;
  readonly language: NewsSourceLanguage;
}

function dedupeMentions(mentions: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const mention of mentions) {
    const normalized = normalizeEntityName(mention);
    if (!normalized || normalized.length < 2 || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(mention.trim());
  }
  return result;
}

function pickResolved(
  rows: readonly EntityResolution[],
  minimumConfidence: number,
): { ids: string[]; unresolved: string[] } {
  const ids: string[] = [];
  const unresolved: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (row.entityId && (row.confidence ?? 0) >= minimumConfidence) {
      if (!seen.has(row.entityId)) {
        seen.add(row.entityId);
        ids.push(row.entityId);
      }
    } else {
      unresolved.push(row.mention);
    }
  }
  return { ids, unresolved };
}

/**
 * Resolves the mentions on one fact set.
 *
 * Competition resolution is single-valued: an article belongs to one
 * competition, and picking two would make the story appear on both
 * competition pages.
 */
export async function resolveEntities(
  gateway: NewsEngineGateway,
  input: ResolveInput,
): Promise<ResolvedEntities> {
  const teamMentions = dedupeMentions(input.teamMentions);
  const playerMentions = dedupeMentions(input.playerMentions);
  const competitionMentions = input.competitionMention
    ? dedupeMentions([input.competitionMention])
    : [];

  const [teamRows, playerRows, competitionRows] = await Promise.all([
    gateway.resolveEntities({ kind: "team", mentions: teamMentions, language: input.language }),
    gateway.resolveEntities({ kind: "player", mentions: playerMentions, language: input.language }),
    gateway.resolveEntities({
      kind: "competition",
      mentions: competitionMentions,
      language: input.language,
    }),
  ]);

  const teams = pickResolved(teamRows, MINIMUM_ALIAS_CONFIDENCE);
  const players = pickResolved(playerRows, MINIMUM_ALIAS_CONFIDENCE);
  const competitions = pickResolved(competitionRows, MINIMUM_ALIAS_CONFIDENCE);

  const unresolved: EntityMention[] = [
    ...teams.unresolved.map((mention) => ({
      kind: "team" as const,
      mention,
      language: input.language,
    })),
    ...players.unresolved.map((mention) => ({
      kind: "player" as const,
      mention,
      language: input.language,
    })),
    ...competitions.unresolved.map((mention) => ({
      kind: "competition" as const,
      mention,
      language: input.language,
    })),
  ];

  return {
    teamIds: teams.ids,
    playerIds: players.ids,
    competitionId: competitions.ids[0] ?? null,
    unresolved,
  };
}
