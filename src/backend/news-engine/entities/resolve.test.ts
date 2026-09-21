import { describe, expect, test } from "bun:test";

import { MINIMUM_ALIAS_CONFIDENCE, resolveEntities } from "./resolve";
import { normalizeEntityName } from "../normalization/text";
import type { EntityResolution, NewsEngineGateway } from "../gateway/contracts";

const WYDAD = "11111111-1111-1111-1111-111111111111";
const RAJA = "22222222-2222-2222-2222-222222222222";
const BOTOLA = "33333333-3333-3333-3333-333333333333";

/** Stands in for the alias table: one club, many spellings. */
const ALIASES: Record<string, Array<{ id: string; confidence: number }>> = {
  [normalizeEntityName("الوداد الرياضي")]: [{ id: WYDAD, confidence: 1 }],
  [normalizeEntityName("Wydad AC")]: [{ id: WYDAD, confidence: 1 }],
  [normalizeEntityName("WAC")]: [{ id: WYDAD, confidence: 0.7 }],
  [normalizeEntityName("الرجاء الرياضي")]: [{ id: RAJA, confidence: 1 }],
  [normalizeEntityName("Botola Pro")]: [{ id: BOTOLA, confidence: 1 }],
  [normalizeEntityName("XY")]: [{ id: WYDAD, confidence: 0.4 }],
};

function gateway(
  calls: Array<{ kind: string; mentions: readonly string[] }> = [],
): NewsEngineGateway {
  return {
    resolveEntities: async (input: {
      kind: string;
      mentions: readonly string[];
    }): Promise<EntityResolution[]> => {
      calls.push({ kind: input.kind, mentions: input.mentions });
      return input.mentions.map((mention) => {
        const normalized = normalizeEntityName(mention);
        const match = ALIASES[normalized]?.[0];
        return {
          mention,
          normalized,
          entityId: match?.id ?? null,
          confidence: match?.confidence ?? null,
        };
      });
    },
  } as unknown as NewsEngineGateway;
}

describe("news engine entity resolution", () => {
  test("Arabic, French and abbreviated names resolve to one club", async () => {
    const resolved = await resolveEntities(gateway(), {
      teamMentions: ["الوداد الرياضي", "Wydad AC", "WAC"],
      playerMentions: [],
      competitionMention: null,
      language: "ar",
    });
    expect(resolved.teamIds).toEqual([WYDAD]);
    expect(resolved.unresolved).toHaveLength(0);
  });

  test("keeps different clubs separate", async () => {
    const resolved = await resolveEntities(gateway(), {
      teamMentions: ["الوداد الرياضي", "الرجاء الرياضي"],
      playerMentions: [],
      competitionMention: null,
      language: "ar",
    });
    expect(resolved.teamIds).toHaveLength(2);
    expect(resolved.teamIds).toContain(WYDAD);
    expect(resolved.teamIds).toContain(RAJA);
  });

  test("records an unknown club as unresolved instead of inventing one", async () => {
    // A duplicate club created because a spelling differed is the failure
    // this whole table exists to prevent.
    const resolved = await resolveEntities(gateway(), {
      teamMentions: ["Some Unknown FC"],
      playerMentions: [],
      competitionMention: null,
      language: "fr",
    });
    expect(resolved.teamIds).toHaveLength(0);
    expect(resolved.unresolved).toEqual([
      { kind: "team", mention: "Some Unknown FC", language: "fr" },
    ]);
  });

  test("rejects a low-confidence alias", async () => {
    const resolved = await resolveEntities(gateway(), {
      teamMentions: ["XY"],
      playerMentions: [],
      competitionMention: null,
      language: "fr",
    });
    expect(resolved.teamIds).toHaveLength(0);
    expect(resolved.unresolved).toHaveLength(1);
    expect(MINIMUM_ALIAS_CONFIDENCE).toBeGreaterThan(0.4);
  });

  test("resolves a single competition, never two", async () => {
    const resolved = await resolveEntities(gateway(), {
      teamMentions: [],
      playerMentions: [],
      competitionMention: "Botola Pro",
      language: "fr",
    });
    expect(resolved.competitionId).toBe(BOTOLA);
  });

  test("deduplicates mentions before querying", async () => {
    const calls: Array<{ kind: string; mentions: readonly string[] }> = [];
    await resolveEntities(gateway(calls), {
      teamMentions: ["الوداد الرياضي", "الوداد الرياضى", "  الوداد الرياضي  "],
      playerMentions: [],
      competitionMention: null,
      language: "ar",
    });
    const teamCall = calls.find((call) => call.kind === "team");
    expect(teamCall?.mentions).toHaveLength(1);
  });

  test("passes the article language through for ranking, not filtering", async () => {
    // Regression: the resolver used to filter candidates by the article's
    // language, so a Latin club name inside an Arabic article resolved to
    // nothing. An alias's script is already encoded in its normalised form,
    // so language can only ever rank.
    const calls: Array<{ kind: string; mentions: readonly string[] }> = [];
    const resolved = await resolveEntities(gateway(calls), {
      teamMentions: ["Wydad AC"],
      playerMentions: [],
      competitionMention: null,
      language: "ar",
    });
    expect(resolved.teamIds).toEqual([WYDAD]);
    expect(resolved.unresolved).toHaveLength(0);
  });

  test("handles a fact set with no mentions at all", async () => {
    const resolved = await resolveEntities(gateway(), {
      teamMentions: [],
      playerMentions: [],
      competitionMention: null,
      language: "ar",
    });
    expect(resolved).toEqual({ teamIds: [], playerIds: [], competitionId: null, unresolved: [] });
  });
});
