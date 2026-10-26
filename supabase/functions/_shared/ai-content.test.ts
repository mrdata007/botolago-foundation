import { describe, expect, it } from "bun:test";
import type { EmailRpcClient } from "./notification-email-dispatch.ts";
import {
  buildUserMessage,
  clubNameProblems,
  handleAiContentRequest,
  inventedScores,
  parseGenerated,
  renderBodyHtml,
  modelFacts,
  renderOwnerEmail,
  unsupportedMentions,
  type ContentJob,
  type GeneratedArticle,
} from "./ai-content.ts";

const TOKEN = "c".repeat(64);
const SCHEDULER = { BOTOLAGO_SCHEDULER_TOKEN: TOKEN };
const para = (text: string) => `${text} ${"x".repeat(120)}`;
const lang = (title: string, body = "Le match") => ({
  title,
  summary: "Un résumé suffisamment long pour passer la validation du texte.",
  paragraphs: [para(body), para(body), para(body)],
});
const article = (frBody = "Le match", arBody = "المباراة"): GeneratedArticle => ({
  fr: lang("Titre de test valide", frBody),
  ar: lang("عنوان اختبار صالح", arBody),
});
const recap: ContentJob = {
  kind: "match_recap",
  fixtureId: "f1",
  facts: { homeScore: 2, awayScore: 1, halfTimeHome: 1, halfTimeAway: 0 },
};

describe("parseGenerated", () => {
  it("accepts a well-formed reply, even wrapped in prose", () => {
    const raw = `Voici: ${JSON.stringify(article())} fin`;
    expect(parseGenerated(raw)?.fr.title).toBe("Titre de test valide");
  });
  it("rejects missing language, short body, and non-JSON", () => {
    expect(parseGenerated("nothing")).toBeNull();
    expect(parseGenerated(JSON.stringify({ fr: lang("Titre de test valide") }))).toBeNull();
    const short = { ...article(), fr: { ...lang("Titre de test valide"), paragraphs: ["court"] } };
    expect(parseGenerated(JSON.stringify(short))).toBeNull();
  });
  it("rejects AI notices in titles, summaries and paragraphs in either language", () => {
    for (const notice of [
      "Cet article a été écrit avec l'intelligence artificielle.",
      "Contenu rédigé avec l'aide de l'IA.",
      "AI-generated article by OpenAI.",
      "كُتب هذا المقال بمساعدة الذكاء الاصطناعي.",
    ]) {
      for (const language of ["fr", "ar"] as const) {
        for (const field of ["title", "summary", "paragraphs"] as const) {
          const reply = article();
          reply[language] = {
            ...reply[language],
            [field]:
              field === "paragraphs" ? [para(notice), para("Le match"), para("Le match")] : notice,
          };
          expect(parseGenerated(JSON.stringify(reply))).toBeNull();
        }
      }
    }
  });
});

describe("inventedScores", () => {
  it("allows the real score in either order and the half-time score", () => {
    expect(
      inventedScores(recap, article("Victoire 2-1 (mi-temps 1-0), soit 1–2 pour eux")),
    ).toEqual([]);
  });
  it("flags a score that is not in the facts", () => {
    expect(inventedScores(recap, article("Une victoire 3-0 écrasante"))).toEqual(["3-0"]);
  });
  it("catches scores written in French, Arabic, colon and spelled-out forms", () => {
    expect(inventedScores(recap, article("Ils s'imposent 3 à 0"))).toEqual(["3-0"]);
    expect(inventedScores(recap, article("x", "فاز الفريق ٣ مقابل ٠"))).toEqual(["3-0"]);
    expect(inventedScores(recap, article("Score final 4:0 au stade"))).toEqual(["4-0"]);
    expect(inventedScores(recap, article("Une victoire trois à zéro"))).toEqual(["3-0"]);
    expect(inventedScores(recap, article("x", "انتهت بنتيجة ثلاثة إلى صفر"))).toEqual(["3-0"]);
  });
  it("allows the real score in those forms, and ignores clock times", () => {
    expect(inventedScores(recap, article("Victoire 2 à 1, deux à un, 2 مقابل 1"))).toEqual([]);
    expect(inventedScores(recap, article("Coup d'envoi à 20:00 puis 9:05"))).toEqual([]);
  });
  it("lets a news roundup repeat a score its source stories state, but not others", () => {
    const news: ContentJob = {
      kind: "news_report",
      fixtureId: null,
      news: [
        {
          editionId: "e1",
          title: "Le Raja s'impose 2-1 face au Wydad",
          excerpt: "Une victoire importante.",
          sourceName: "Outlet",
          sourceUrl: "https://example.test/a",
        },
      ],
    };
    expect(inventedScores(news, article("Le Raja gagne 2-1 selon Outlet"))).toEqual([]);
    expect(inventedScores(news, article("Le Raja gagne 4-0"))).toEqual(["4-0"]);
  });
  it("reads Arabic-Indic digits and ignores dates and clock times", () => {
    expect(inventedScores(recap, article("x", "فاز الفريق ٤-٠"))).toEqual(["4-0"]);
    expect(inventedScores(recap, article("Le 2026-10-03 à 20:00 le match"))).toEqual([]);
  });
});

describe("modelFacts and the recap prompt", () => {
  it("drops unknown half-time and shoot-out scores instead of sending nulls", () => {
    const job: ContentJob = {
      kind: "match_recap",
      fixtureId: "f",
      facts: {
        homeScore: 2,
        awayScore: 5,
        halfTimeHome: null,
        halfTimeAway: null,
        penaltyHome: null,
        penaltyAway: null,
      },
    };
    expect(modelFacts(job.facts!)).toEqual({ homeScore: 2, awayScore: 5 });
    const factsJson = buildUserMessage(job).split("FACTS (JSON):")[1];
    expect(factsJson).not.toContain("null");
    expect(factsJson).not.toContain("halfTime");
    expect(factsJson).not.toContain("penalty");
  });
  it("keeps a complete pair and drops a half-known one", () => {
    expect(
      modelFacts({ homeScore: 1, awayScore: 1, halfTimeHome: 0, halfTimeAway: 1, penaltyHome: 4 }),
    ).toEqual({ homeScore: 1, awayScore: 1, halfTimeHome: 0, halfTimeAway: 1 });
  });
});

describe("unsupportedMentions", () => {
  const league: ContentJob = {
    kind: "match_recap",
    fixtureId: "f",
    facts: { homeScore: 2, awayScore: 5, halfTimeHome: null, halfTimeAway: null },
  };
  it("accepts a clean report", () => {
    expect(unsupportedMentions(league, article("Une belle victoire", "المباراة"))).toEqual([]);
  });
  it("rejects remarks about missing data in French and Arabic", () => {
    for (const fr of [
      "Le score à la mi-temps n'a pas été communiqué.",
      "Le score à la mi-temps reste inconnu.",
      "Aucune information sur la mi-temps.",
      "Score non communiqué",
    ]) {
      expect(unsupportedMentions(league, article(fr))).toEqual(["missing_data_remark"]);
    }
    for (const ar of [
      "لم يتم الإعلان عن نتيجة الشوط الأول.",
      "نتيجة الشوط الأول غير متوفرة.",
      "لَمْ يُعلَن عن النتيجة",
    ]) {
      expect(unsupportedMentions(league, article("Le match", ar))).toEqual(["missing_data_remark"]);
    }
  });
  it("rejects a shoot-out or extra time in a match without a shoot-out score", () => {
    expect(unsupportedMentions(league, article("Pas de tirs au but, victoire nette"))).toEqual([
      "penalty_shootout",
    ]);
    expect(unsupportedMentions(league, article("Le match", "حسمت ركلات الترجيح اللقاء"))).toEqual([
      "penalty_shootout",
    ]);
    expect(unsupportedMentions(league, article("Après prolongation, victoire"))).toEqual([
      "extra_time",
    ]);
  });
  it("allows a shoot-out when the facts carry the shoot-out score", () => {
    const cup: ContentJob = {
      kind: "match_recap",
      fixtureId: "f",
      facts: { homeScore: 1, awayScore: 1, penaltyHome: 4, penaltyAway: 3 },
    };
    expect(
      unsupportedMentions(cup, article("Victoire aux tirs au but après prolongation")),
    ).toEqual([]);
  });
  it("leaves news reports and blogs alone: an unavailable player is ordinary news", () => {
    const news: ContentJob = { kind: "news_report", fixtureId: null, facts: {} };
    const blog: ContentJob = { kind: "blog", fixtureId: null, facts: {} };
    const text = article("Le défenseur est indisponible pour le match", "اللاعب غير متاح للمباراة");
    expect(unsupportedMentions(news, text)).toEqual([]);
    expect(unsupportedMentions(blog, text)).toEqual([]);
  });
  it("does not apply shoot-out checks to previews", () => {
    const preview: ContentJob = { kind: "match_preview", fixtureId: "f", facts: {} };
    expect(unsupportedMentions(preview, article("Une finale, peut-être aux tirs au but"))).toEqual(
      [],
    );
  });
});

describe("club names", () => {
  const zemamra: ContentJob = {
    kind: "match_recap",
    fixtureId: "f",
    facts: {
      home: { fr: "Maghreb Fès", ar: "نادي المغرب الرياضي الفاسي" },
      away: { fr: "Renaissance Club Athletic Zemamra", ar: "نادي النهضة أتلتيك الزمامرة" },
      homeScore: 2,
      awayScore: 1,
    },
  };
  const ok = article(
    "Maghreb Fès a battu Renaissance Club Athletic Zemamra, et Renaissance Club Athletic Zemamra a résisté.",
    "فاز نادي المغرب الرياضي الفاسي على نادي النهضة أتلتيك الزمامرة",
  );
  it("accepts a report that uses the fact names", () => {
    expect(clubNameProblems(zemamra, ok)).toEqual([]);
    expect(unsupportedMentions(zemamra, ok)).toEqual([]);
  });
  it("rejects the audit's three names for one club", () => {
    for (const alias of ["RCA Zemamra", "CR Khemis Zemamra", "Renaissance Zemamra"]) {
      const text = article(`Maghreb Fès a battu Renaissance Club Athletic Zemamra puis ${alias}.`);
      expect(clubNameProblems(zemamra, text)).toEqual(["club_alias:rca-zemamra"]);
      expect(unsupportedMentions(zemamra, text)).toEqual(["club_alias:rca-zemamra"]);
    }
    const ar = article("Le match", "فاز نادي المغرب الرياضي الفاسي على نهضة الزمامرة");
    expect(clubNameProblems(zemamra, ar)).toEqual(["club_alias:rca-zemamra"]);
  });
  it("is not fooled by accents, case or a canonical name containing an alias", () => {
    const text = article("MAGHREB FES a battu renaissance club athletic zemamra");
    expect(clubNameProblems(zemamra, text)).toEqual([]);
    const raja: ContentJob = {
      kind: "match_recap",
      fixtureId: "f",
      facts: { home: { fr: "Raja Club Athletic", ar: "x" }, away: { fr: "Amal Tiznit", ar: "y" } },
    };
    expect(clubNameProblems(raja, article("Raja Club Athletic bat Amal Tiznit"))).toEqual([]);
    expect(clubNameProblems(raja, article("Le Raja CA bat Amal Tiznit"))).toEqual([
      "club_alias:raja-casablanca",
    ]);
  });
  it("rejects a known club that is not in the facts", () => {
    const text = article(
      "Maghreb Fès a battu Renaissance Club Athletic Zemamra devant le Wydad Casablanca",
    );
    expect(clubNameProblems(zemamra, text)).toEqual(["club_not_in_facts:wydad-casablanca"]);
  });
  it("allows previews to name the opponents listed in the recent results", () => {
    const preview: ContentJob = {
      kind: "match_preview",
      fixtureId: "f",
      facts: {
        home: { fr: "Maghreb Fès", ar: "a" },
        away: { fr: "Raja Casablanca", ar: "b" },
        homeLastResults: [{ opponent: "Wydad Casablanca", scored: 1, conceded: 0 }],
      },
    };
    expect(
      clubNameProblems(
        preview,
        article("Maghreb Fès reçoit Raja Casablanca après Wydad Casablanca"),
      ),
    ).toEqual([]);
    expect(
      clubNameProblems(preview, article("Maghreb Fès reçoit Raja Casablanca après RSB Berkane")),
    ).toEqual(["club_not_in_facts:rsb-berkane"]);
  });
  it("leaves news and blog posts, and jobs without team facts, alone", () => {
    const news: ContentJob = { kind: "news_report", fixtureId: null, facts: {} };
    expect(clubNameProblems(news, article("Le Wydad Casablanca et RCA Zemamra"))).toEqual([]);
    expect(clubNameProblems(recap, article("Le Wydad Casablanca"))).toEqual([]);
  });
  it("sends the exact club names to the model in the facts", () => {
    const message = buildUserMessage(zemamra);
    expect(message).toContain("Renaissance Club Athletic Zemamra");
  });
});

describe("renderBodyHtml", () => {
  it("escapes model text and only links https sources from the database", () => {
    const text = {
      ...lang("Titre de test valide"),
      paragraphs: ["<script>alert(1)</script> " + "x".repeat(100)],
    };
    const html = renderBodyHtml("fr", text, [
      {
        editionId: "e1",
        title: "t",
        excerpt: "e",
        sourceName: "Le <b>Matin</b>",
        sourceUrl: "https://example.test/a",
      },
      {
        editionId: "e2",
        title: "t",
        excerpt: "e",
        sourceName: "Bad",
        sourceUrl: "javascript:alert(1)",
      },
    ]);
    expect(html).not.toContain("<script");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain('href="https://example.test/a"');
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("intelligence artificielle");
    expect(renderBodyHtml("ar", lang("عنوان اختبار صالح"), undefined)).not.toContain(
      "الذكاء الاصطناعي",
    );
  });
});

describe("prompt and email", () => {
  it("sends only facts, never other outlets' source URLs", () => {
    const message = buildUserMessage({
      kind: "news_report",
      fixtureId: null,
      news: [
        {
          editionId: "e",
          title: "T",
          excerpt: "X",
          sourceName: "Outlet",
          sourceUrl: "https://secret.test/x",
        },
      ],
    });
    expect(message).toContain("Outlet");
    expect(message).not.toContain("secret.test");
  });
  it("builds a subject and a pause instruction", () => {
    const mail = renderOwnerEmail(
      [
        {
          id: "1",
          kind: "blog",
          language: "fr",
          title: "Un titre",
          slug: "ai-blog-fr-1",
          model: "m",
        },
      ],
      "https://botolago.com",
    );
    expect(mail.subject).toBe("[BotolaGO AI] Published: Un titre");
    expect(mail.text).toContain("https://botolago.com/news/ai-blog-fr-1");
    expect(mail.text).toContain("ai_content_configure(false)");
  });
});

function fakeClient(plan: unknown, calls: { name: string; args: unknown }[]): EmailRpcClient {
  return {
    schema() {
      return {
        rpc(name: string, args: Record<string, unknown>) {
          calls.push({ name, args });
          const data: Record<string, unknown> = {
            service_ai_content_plan: plan,
            service_ai_content_publish: { storyId: "story-1", articleId: "a" },
            service_ai_content_pending_notices: [
              {
                id: "n1",
                kind: "match_recap",
                language: "fr",
                title: "Titre",
                slug: "s",
                model: "m",
              },
            ],
            service_ops_alert_email_target: "owner@example.test",
            service_ai_content_record_notice: null,
          };
          return Promise.resolve({ data: data[name] ?? null, error: null });
        },
      };
    },
  } as unknown as EmailRpcClient;
}

const env = {
  ...SCHEDULER,
  OPENAI_KEY: "sk-test-0123456789abcdefghij",
  RESEND_API_KEY: "re_test_0123456789abcdef",
};
const request = () =>
  new Request("https://x.test/", {
    method: "POST",
    headers: { "x-botolago-scheduler-token": TOKEN },
  });

function fetchStub(reply: unknown, sent: { url: string }[]): typeof fetch {
  return (async (url: string) => {
    sent.push({ url });
    if (String(url).includes("openai")) {
      return new Response(
        JSON.stringify({ choices: [{ message: { content: JSON.stringify(reply) } }] }),
      );
    }
    return new Response(JSON.stringify({ id: "mail" }));
  }) as unknown as typeof fetch;
}

describe("handleAiContentRequest", () => {
  it("publishes both languages, then emails the owner and records it", async () => {
    const calls: { name: string; args: unknown }[] = [];
    const sent: { url: string }[] = [];
    const response = await handleAiContentRequest(request(), {
      environment: env,
      client: fakeClient({ enabled: true, jobs: [recap] }, calls),
      fetchImpl: fetchStub(article("Victoire 2-1"), sent),
      randomHex: () => "abcd1234",
    });
    expect(await response.json()).toMatchObject({ published: 1, rejected: 0, notified: 1 });
    const publishes = calls.filter((c) => c.name === "service_ai_content_publish");
    expect(publishes).toHaveLength(1);
    const editions = (publishes[0].args as { p_editions: { language: string }[] }).p_editions;
    expect(editions.map((e) => e.language)).toEqual(["fr", "ar"]);
    expect(sent.some((s) => s.url.includes("resend"))).toBe(true);
    expect(calls.find((c) => c.name === "service_ai_content_record_notice")?.args).toMatchObject({
      p_sent: true,
    });
  });

  it("does not publish an article with an invented score", async () => {
    const calls: { name: string; args: unknown }[] = [];
    const response = await handleAiContentRequest(request(), {
      environment: env,
      client: fakeClient({ enabled: true, jobs: [recap] }, calls),
      fetchImpl: fetchStub(article("Large victoire 5-0"), []),
    });
    expect(await response.json()).toMatchObject({ published: 0, rejected: 1 });
    expect(calls.some((c) => c.name === "service_ai_content_publish")).toBe(false);
  });

  it("does not publish a report that mentions missing data or a shoot-out", async () => {
    for (const body of [
      "Le score à la mi-temps n'a pas été communiqué.",
      "Match décidé aux tirs au but.",
    ]) {
      const calls: { name: string; args: unknown }[] = [];
      const response = await handleAiContentRequest(request(), {
        environment: env,
        client: fakeClient({ enabled: true, jobs: [recap] }, calls),
        fetchImpl: fetchStub(article(body), []),
      });
      expect(await response.json()).toMatchObject({ published: 0, rejected: 1 });
      expect(calls.some((c) => c.name === "service_ai_content_publish")).toBe(false);
    }
  });

  it("does nothing when the feature is off, and never calls the AI", async () => {
    const sent: { url: string }[] = [];
    const response = await handleAiContentRequest(request(), {
      environment: env,
      client: fakeClient({ enabled: false, jobs: [] }, []),
      fetchImpl: fetchStub(article(), sent),
    });
    expect(await response.json()).toMatchObject({ idle: true });
    expect(sent.some((s) => s.url.includes("openai"))).toBe(false);
  });

  it("rejects a wrong scheduler token without a database call", async () => {
    for (const token of ["nope", "9".repeat(64)]) {
      const calls: { name: string; args: unknown }[] = [];
      const response = await handleAiContentRequest(
        new Request("https://x.test/", {
          method: "POST",
          headers: { "x-botolago-scheduler-token": token },
        }),
        { environment: env, client: fakeClient(null, calls) },
      );
      expect(response.status).toBe(401);
      expect(calls).toEqual([]);
    }
  });
});
