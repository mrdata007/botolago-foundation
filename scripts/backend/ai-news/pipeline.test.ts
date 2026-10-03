import { describe, expect, test } from "bun:test";
import {
  runPipeline,
  selectCandidates,
  validateArticle,
  renderArticle,
  type Candidate,
  type GeneratedArticle,
  type Store,
} from "./pipeline";

const now = new Date("2026-09-27T10:00:00Z");
const candidate: Candidate = {
  sourceId: "elbotola:123",
  url: "https://www.elbotola.com/article/2026-09-27-10-00-123.html",
  outlet: "ElBotola",
  publishedAt: "2026-09-27T08:00:00Z",
  retrievedAt: now.toISOString(),
  language: "fr",
  title: "Le club annonce une décision concernant son équipe première",
  sourceText:
    "Le club a annoncé dans un communiqué une décision concernant son équipe première. Le calendrier de la compétition sera publié ultérieurement.",
  competition: "botola-pro-inwi",
  facts: [
    {
      id: "f1",
      text: "Le club a annoncé une décision concernant son équipe première.",
      sourceUrl: "https://www.elbotola.com/article/2026-09-27-10-00-123.html",
      outlet: "ElBotola",
    },
    {
      id: "f2",
      text: "Le calendrier de la compétition sera publié ultérieurement.",
      sourceUrl: "https://www.elbotola.com/article/2026-09-27-10-00-123.html",
      outlet: "ElBotola",
    },
  ],
};
const article: GeneratedArticle = {
  headline: "Une annonce du club au sujet de son équipe première",
  lead: {
    text: "Selon ElBotola, le club a fait connaître une décision qui concerne son équipe première.",
    factIds: ["f1"],
  },
  body: [
    {
      text: "Cette annonce porte sur le groupe engagé dans la compétition nationale, rapporte ElBotola.",
      factIds: ["f1"],
    },
    {
      text: "Le calendrier de la compétition doit encore être communiqué, selon le même média.",
      factIds: ["f2"],
    },
  ],
  excerpt: "Le club a communiqué au sujet de son équipe première, selon ElBotola.",
  seoTitle: "Annonce du club sur son équipe première",
  seoDescription:
    "Selon ElBotola, le club a communiqué une décision qui concerne son équipe première.",
};
const options = {
  dailyLimit: 3,
  maximumAgeHours: 72,
  automaticPublication: false,
  dryRun: false,
  now,
};

describe("AI news selection", () => {
  test("suppresses source duplicate, syndicated headline, stale story and zero daily cap", () => {
    const another = { ...candidate, sourceId: "other:9", url: "https://example.org/other" };
    expect(
      selectCandidates(
        [candidate],
        [{ sourceId: candidate.sourceId, url: "", title: "", publishedAt: "" }],
        options,
      ),
    ).toEqual([]);
    expect(
      selectCandidates(
        [another],
        [{ sourceId: "", url: "", title: candidate.title, publishedAt: "" }],
        options,
      ),
    ).toEqual([]);
    expect(
      selectCandidates([{ ...candidate, publishedAt: "2026-09-20T08:00:00Z" }], [], options),
    ).toEqual([]);
    expect(selectCandidates([candidate], [], { ...options, dailyLimit: 0 })).toEqual([]);
  });
  test("selects fewer stories than the configured ceiling", () => {
    expect(selectCandidates([candidate], [], options)).toEqual([candidate]);
  });
  test("flags an updated source ID for review without creating a duplicate", async () => {
    const store: Store = {
      async existing() {
        return [
          {
            sourceId: candidate.sourceId,
            url: candidate.url,
            title: "Older headline",
            publishedAt: "2026-09-27T07:00:00Z",
          },
        ];
      },
      async pendingAutoPublication() {
        return [];
      },
      async saveDraft() {
        throw new Error("update_was_saved_as_new");
      },
      async publish() {
        throw new Error("update_was_published");
      },
    };
    const result = await runPipeline(
      [candidate],
      store,
      {
        model: "fixture",
        async generate() {
          throw new Error("duplicate_was_generated");
        },
        async verify() {
          return true;
        },
      },
      options,
    );
    expect(result).toMatchObject({ updatesHeld: 1, drafted: 0, published: 0 });
  });
});

describe("AI article gates", () => {
  test("rejects invented numeric claims, quotes, missing evidence IDs and copied text", () => {
    expect(
      validateArticle(candidate, {
        ...article,
        body: [
          { text: "Le score est de 9 contre 0 et cela change la saison.", factIds: ["f1"] },
          ...article.body,
        ],
      }),
    ).toContain("unsupported_number_or_date");
    expect(
      validateArticle(candidate, {
        ...article,
        headline: "Le club déclare «une décision historique»",
      }),
    ).toContain("unattributed_quote");
    expect(
      validateArticle(candidate, { ...article, lead: { ...article.lead, factIds: ["missing"] } }),
    ).toContain("unsupported_paragraph");
    expect(
      validateArticle(candidate, {
        ...article,
        body: [{ text: candidate.sourceText, factIds: ["f1"] }, ...article.body],
      }),
    ).toContain("near_duplicate_source_text");
  });
  test("renders escaped text with direct source attribution", () => {
    const html = renderArticle(candidate, {
      ...article,
      lead: {
        text: "Le club <script>test</script> a communiqué une décision concernant l'équipe première.",
        factIds: ["f1"],
      },
    });
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain(candidate.url);
    expect(html).toContain("nofollow noopener noreferrer");
  });
  test("keeps a single-outlet article as a draft even with automatic publishing requested", async () => {
    const keys = new Set<string>();
    let published = 0;
    const store: Store = {
      async existing() {
        return [];
      },
      async pendingAutoPublication() {
        return [];
      },
      async saveDraft(draft) {
        if (keys.has(draft.key)) return "existing";
        keys.add(draft.key);
        return "created";
      },
      async publish() {
        published += 1;
      },
    };
    const writer = {
      model: "fixture",
      async generate() {
        return article;
      },
      async verify() {
        return true;
      },
    };
    const first = await runPipeline([candidate], store, writer, {
      ...options,
      automaticPublication: true,
    });
    const retry = await runPipeline([candidate], store, writer, {
      ...options,
      automaticPublication: true,
    });
    expect(first).toMatchObject({ drafted: 1, published: 0 });
    expect(retry).toMatchObject({ existing: 1, published: 0 });
    expect(published).toBe(0);
  });
  test("holds an article when the second fact-check call rejects it", async () => {
    let savedQuality = "";
    const store: Store = {
      async existing() {
        return [];
      },
      async pendingAutoPublication() {
        return [];
      },
      async saveDraft(draft) {
        savedQuality = draft.quality;
        return "created";
      },
      async publish() {
        throw new Error("unsupported_article_was_published");
      },
    };
    const result = await runPipeline(
      [candidate],
      store,
      {
        model: "fixture",
        async generate() {
          return article;
        },
        async verify() {
          return false;
        },
      },
      options,
    );
    expect(result).toMatchObject({ held: 1, heldDrafts: 1, drafted: 0, published: 0 });
    expect(savedQuality).toBe("review_required");
  });
  test("counts review drafts against the daily save limit", async () => {
    let generated = 0;
    let saved = 0;
    const later = {
      ...candidate,
      sourceId: "elbotola:124",
      url: "https://www.elbotola.com/article/2026-09-27-09-00-124.html",
      title: "Un calendrier révisé pour la compétition nationale",
      publishedAt: "2026-09-27T07:00:00Z",
    };
    const store: Store = {
      async existing() {
        return [];
      },
      async pendingAutoPublication() {
        return [];
      },
      async saveDraft() {
        saved += 1;
        return "created";
      },
      async publish() {
        throw new Error("review_draft_was_published");
      },
    };
    const result = await runPipeline(
      [candidate, later],
      store,
      {
        model: "fixture",
        async generate() {
          generated += 1;
          return article;
        },
        async verify() {
          return false;
        },
      },
      { ...options, dailyLimit: 1 },
    );
    expect(result.heldDrafts).toBe(1);
    expect(saved).toBe(1);
    expect(generated).toBe(1);
  });
  test("retries a saved, eligible draft without regenerating its article", async () => {
    const attempts: string[] = [];
    const store: Store = {
      async existing() {
        return [];
      },
      async pendingAutoPublication() {
        return attempts.length ? [] : ["saved-key"];
      },
      async saveDraft() {
        throw new Error("unexpected_new_draft");
      },
      async publish(key) {
        attempts.push(key);
      },
    };
    const writer = {
      model: "fixture",
      async generate() {
        throw new Error("unexpected_generation");
      },
      async verify() {
        return true;
      },
    };
    const first = await runPipeline([], store, writer, { ...options, automaticPublication: true });
    const retry = await runPipeline([], store, writer, { ...options, automaticPublication: true });
    expect(first.published).toBe(1);
    expect(retry.published).toBe(0);
    expect(attempts).toEqual(["saved-key"]);
  });
});
