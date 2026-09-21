import { describe, expect, test } from "bun:test";

import { assessFactualQuality, combineVerdicts } from "./factual";
import type { GeneratedArticle } from "../contracts";

function article(overrides: Partial<GeneratedArticle> = {}): GeneratedArticle {
  return {
    language: "fr",
    headline: "Raja recrute un milieu de terrain",
    slug: "raja-recrute-fr-abcd1234",
    excerpt: "Le club casablancais a communique sur l'arrivee du joueur.",
    bodyHtml: "<p>Selon les informations rapportees, le joueur devrait rejoindre le club.</p>",
    category: "transfers",
    tags: [],
    seoTitle: "Raja recrute un milieu",
    metaDescription: "Le club casablancais a communique sur l'arrivee du joueur cette semaine.",
    openGraphTitle: "Raja recrute un milieu",
    openGraphDescription:
      "Le club casablancais a communique sur l'arrivee du joueur cette semaine.",
    ...overrides,
  };
}

const baseInput = {
  bestClaimStatus: "reported" as const,
  score: null,
  eventType: "transfer_rumour",
  knownTeamNames: ["Raja Casablanca"],
  knownPlayerNames: [] as string[],
  hasConflict: false,
  conflictSummary: null,
  unresolvedCount: 0,
};

describe("news engine factual gate", () => {
  test("rejects reported news written as an official announcement", () => {
    // The single most damaging failure mode: turning "reported" into "confirmed".
    const report = assessFactualQuality({
      ...baseInput,
      article: article({
        bodyHtml: "<p>Le club a officiellement annonce la signature du joueur ce dimanche.</p>",
      }),
    });
    expect(report.verdict).toBe("rejected");
    expect(report.violations[0]).toContain("officiellement");
  });

  test("rejects the same failure in Arabic", () => {
    const report = assessFactualQuality({
      ...baseInput,
      article: article({
        language: "ar",
        bodyHtml: "<p>أعلن النادي رسميا التعاقد مع اللاعب اليوم الأحد.</p>",
      }),
    });
    expect(report.verdict).toBe("rejected");
  });

  test("rejects reported news with no attribution at all", () => {
    const report = assessFactualQuality({
      ...baseInput,
      article: article({
        bodyHtml: "<p>Le joueur rejoint le club cette semaine pour trois saisons.</p>",
      }),
    });
    expect(report.verdict).toBe("rejected");
    expect(report.violations[0]).toContain("no attribution");
  });

  test("accepts attributed reporting", () => {
    const report = assessFactualQuality({
      ...baseInput,
      article: article({
        bodyHtml:
          "<p>Selon les informations de la presse marocaine, le joueur devrait rejoindre le club dans les prochains jours.</p>",
      }),
    });
    expect(report.verdict).toBe("passed");
  });

  test("accepts a direct assertion when the claim really is official", () => {
    const report = assessFactualQuality({
      ...baseInput,
      bestClaimStatus: "official",
      article: article({
        bodyHtml: "<p>Le club a officiellement annonce la signature du joueur ce dimanche.</p>",
      }),
    });
    expect(report.verdict).toBe("passed");
  });

  test("rejects a scoreline that contradicts the extracted result", () => {
    const report = assessFactualQuality({
      ...baseInput,
      bestClaimStatus: "official",
      eventType: "match_result",
      score: { home: 2, away: 1 },
      article: article({
        bodyHtml: "<p>Raja s'est impose 3-0 face a son adversaire dimanche.</p>",
      }),
    });
    expect(report.verdict).toBe("rejected");
    expect(report.violations[0]).toContain("3-0");
  });

  test("rejects a scoreline no source provided", () => {
    const report = assessFactualQuality({
      ...baseInput,
      bestClaimStatus: "official",
      eventType: "match_result",
      score: null,
      article: article({
        bodyHtml: "<p>Raja s'est impose 2-1 face a son adversaire dimanche.</p>",
      }),
    });
    expect(report.verdict).toBe("rejected");
  });

  test("accepts a matching scoreline", () => {
    const report = assessFactualQuality({
      ...baseInput,
      bestClaimStatus: "official",
      eventType: "match_result",
      score: { home: 2, away: 1 },
      article: article({
        bodyHtml: "<p>Raja s'est impose 2-1 face a son adversaire dimanche.</p>",
      }),
    });
    expect(report.verdict).toBe("passed");
  });

  test("sends a conflicting story to review without picking a side", () => {
    const report = assessFactualQuality({
      ...baseInput,
      bestClaimStatus: "official",
      hasConflict: true,
      conflictSummary: "Sources disagree on the final score.",
      article: article({
        bodyHtml: "<p>Le club a communique officiellement sur la rencontre.</p>",
      }),
    });
    expect(report.verdict).toBe("needs_review");
    expect(report.reason).toContain("must not choose");
  });

  test("sends an unresolved entity to review", () => {
    const report = assessFactualQuality({
      ...baseInput,
      bestClaimStatus: "official",
      unresolvedCount: 2,
      article: article({
        bodyHtml: "<p>Le club a communique officiellement sur la rencontre.</p>",
      }),
    });
    expect(report.verdict).toBe("needs_review");
  });

  test("sends a story with no resolved entity to review", () => {
    const report = assessFactualQuality({
      ...baseInput,
      bestClaimStatus: "official",
      knownTeamNames: [],
      knownPlayerNames: [],
      article: article({
        bodyHtml: "<p>Le club a communique officiellement sur la rencontre.</p>",
      }),
    });
    expect(report.verdict).toBe("needs_review");
  });
});

describe("combineVerdicts", () => {
  test("takes the worse of the two gates", () => {
    expect(combineVerdicts("passed", "passed")).toBe("passed");
    expect(combineVerdicts("passed", "needs_review")).toBe("needs_review");
    expect(combineVerdicts("needs_review", "rejected")).toBe("rejected");
    expect(combineVerdicts("needs_regeneration", "needs_review")).toBe("needs_regeneration");
  });
});
