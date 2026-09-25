import { describe, expect, it } from "vitest";
import {
  ARTICLE_BREADCRUMB_LABELS,
  articleDescription,
  articleModifiedAt,
  buildArticleHead,
  buildArticleJsonLd,
  buildCanonicalArticleUrl,
  serializeJsonLd,
  unclippedSeoText,
} from "./article-meta";
import type { ArticleDetailDto } from "@/backend/news/contracts";
import { dictionaries } from "@/i18n/dictionaries";
import {
  articleText,
  clip,
  SEO_DESCRIPTION_LIMIT,
  SEO_TITLE_LIMIT,
  toEdition,
} from "../../scripts/backend/elbotola-licensed-import";

function detail(overrides: Partial<ArticleDetailDto> = {}): ArticleDetailDto {
  return {
    id: "article-1",
    storyId: "story-1",
    language: "fr",
    slug: "titre-officiel",
    title: "Titre officiel",
    subtitle: null,
    summary: "Résumé officiel",
    publishedAt: "2026-08-02T12:00:00.000Z",
    updatedAt: "2026-08-02T12:00:00.000Z",
    readingTimeMinutes: 4,
    hero: {
      id: "hero-1",
      sourceUrl: "https://media.example.test/article.jpg",
      storagePath: null,
      alt: "Alt",
      caption: null,
      credit: null,
      width: 1600,
      height: 1000,
      mimeType: "image/jpeg",
    },
    author: { id: "author-1", slug: "author", name: "Amine El Idrissi" },
    publisher: { id: "pub-1", slug: "botolago", name: "BotolaGO" },
    primaryCategory: { id: "cat-1", slug: "mercato", name: "Mercato" },
    tags: [],
    teamIds: [],
    competitionIds: [],
    placement: null,
    isSaved: false,
    bodyHtml: "<p>Contenu</p>",
    bodyFormat: "rich_text",
    seo: { title: null, description: null },
    taxonomies: [],
    competitions: [],
    teams: [],
    players: [],
    ...overrides,
  } as ArticleDetailDto;
}

describe("buildCanonicalArticleUrl", () => {
  it("encodes the identifier into a stable botolago.com URL", () => {
    expect(buildCanonicalArticleUrl("article 1")).toBe("https://botolago.com/news/article%201");
  });
});

describe("licensed (syndicated) content", () => {
  const source = {
    name: "ElBotola",
    url: "https://www.elbotola.com/article/2026-09-22-23-19-974.html",
  };

  it("is indexable and points at the original", () => {
    const article = detail({ source });
    const head = buildArticleHead(article, article.id);

    expect(head.meta.some((tag) => "name" in tag && tag.name === "robots")).toBe(false);
    expect(buildArticleJsonLd(article, buildCanonicalArticleUrl(article.id))?.isBasedOn).toBe(
      source.url,
    );
  });

  it("BotolaGO's own articles stay indexable", () => {
    const head = buildArticleHead(detail({ source: null }), "article-1");

    expect(head.meta.some((tag) => "name" in tag && tag.name === "robots")).toBe(false);
    expect(buildArticleJsonLd(detail(), "https://botolago.com/news/article-1")).not.toHaveProperty(
      "isBasedOn",
    );
  });
});

describe("article metadata", () => {
  it("emits article-specific social, canonical, image, and publication metadata", () => {
    const article = detail();
    const head = buildArticleHead(article, "article 1");

    // The loaded edition's id, not the identifier in the address bar.
    expect(head.links).toEqual([{ rel: "canonical", href: "https://botolago.com/news/article-1" }]);
    expect(head.meta).not.toContainEqual({ name: "robots", content: "noindex" });
    expect(head.meta).toContainEqual({ title: "Titre officiel — BotolaGO" });
    expect(head.meta).toContainEqual({ property: "og:type", content: "article" });
    expect(head.meta).toContainEqual({
      property: "article:published_time",
      content: article.publishedAt,
    });
    expect(head.meta).toContainEqual({
      property: "og:image",
      content: "https://media.example.test/article.jpg",
    });
    expect(head.meta).not.toContainEqual(
      expect.objectContaining({ property: "article:modified_time" }),
    );
  });

  it("reads the CURRENTLY RENDERED language's title/summary, not French, for an Arabic edition", () => {
    const arabic = detail({
      language: "ar",
      title: "عنوان رسمي",
      summary: "ملخص رسمي",
      subtitle: null,
    });
    const head = buildArticleHead(arabic, "article-ar");

    expect(head.meta).toContainEqual({ title: "عنوان رسمي — BotolaGO" });
    expect(head.meta).toContainEqual({ name: "description", content: "ملخص رسمي" });
    expect(head.meta).toContainEqual({ property: "og:locale", content: "ar_MA" });
  });

  it("prefers the DTO's own seo.title/seo.description when present", () => {
    const article = detail({ seo: { title: "SEO title", description: "SEO description" } });
    const head = buildArticleHead(article, "article-1");
    expect(head.meta).toContainEqual({ title: "SEO title — BotolaGO" });
    expect(head.meta).toContainEqual({ name: "description", content: "SEO description" });
  });

  // Was: "when updatedAt differs from publishedAt". updatedAt is bookkeeping:
  // a bulk update on 2026-09-24 moved it on 15,690 unchanged articles, and
  // every one then claimed an edit (audit P1-4). The real edit time is
  // contentUpdatedAt.
  it("surfaces a modified time only for a real edit after publishing", () => {
    const edited = detail({ contentUpdatedAt: "2026-08-03T09:00:00.000Z" });
    const head = buildArticleHead(edited, "article-1");
    expect(head.meta).toContainEqual({
      property: "article:modified_time",
      content: "2026-08-03T09:00:00.000Z",
    });
    expect(buildArticleJsonLd(edited, "https://botolago.com/news/x")!.dateModified).toBe(
      "2026-08-03T09:00:00.000Z",
    );
  });

  it("a bumped updatedAt alone claims no modification", () => {
    const touched = detail({
      updatedAt: "2026-09-24T12:57:00.000Z",
      contentUpdatedAt: "2026-08-02T12:00:00.000Z",
    });
    const head = buildArticleHead(touched, "article-1");
    expect(head.meta).not.toContainEqual(
      expect.objectContaining({ property: "article:modified_time" }),
    );
    expect(buildArticleJsonLd(touched, "https://botolago.com/news/x")!.dateModified).toBe(
      "2026-08-02T12:00:00.000Z",
    );
    // An API build without contentUpdatedAt claims nothing either.
    expect(articleModifiedAt(detail({ updatedAt: "2026-09-24T12:57:00.000Z" }))).toBeNull();
  });

  it("a page whose read failed stays indexable; a missing one does not", () => {
    const failed = buildArticleHead(null, "article-1", { unavailable: true });
    expect(failed.meta).not.toContainEqual(expect.objectContaining({ name: "robots" }));
    const missing = buildArticleHead(null, "article-1");
    expect(missing.meta).toContainEqual({ name: "robots", content: "noindex" });
  });

  it("falls back to a generic BotolaGO head when no article loaded, and adds no JSON-LD", () => {
    const head = buildArticleHead(null, "missing");
    expect(head.meta).toContainEqual({ title: "Actualités — BotolaGO" });
    expect(head).not.toHaveProperty("scripts");
  });

  it("keeps a missing, unpublished or withdrawn article out of the index", () => {
    const head = buildArticleHead(null, "withdrawn-slug");
    expect(head.meta).toContainEqual({ name: "robots", content: "noindex" });
  });

  it("the slug URL and the id URL of one edition declare the same canonical", () => {
    const article = detail({ id: "9b2f0c1e-0000-4000-8000-000000000001", slug: "titre" });
    const bySlug = buildArticleHead(article, "titre");
    const byId = buildArticleHead(article, article.id);
    expect(bySlug.links).toEqual(byId.links);
    expect(bySlug.links[0].href).toBe(`https://botolago.com/news/${article.id}`);
  });

  it("declares the JSON-LD script in the flat shape the router renders", () => {
    // The router builds the <script> itself and turns every key but `children`
    // into an attribute. Declaring {tag, attrs, children} reads like the output
    // but produced `<script tag="script" attrs="[object Object]">` with no type,
    // so the browser ran the JSON as JavaScript and crawlers saw nothing. This
    // is the assertion that was missing: it pins the input shape, not our own.
    // Two blocks since the breadcrumb joined the NewsArticle; every one flat.
    const head = buildArticleHead(detail(), "article-1");
    expect(head.scripts).toHaveLength(2);
    for (const script of head.scripts!) {
      expect(script.type).toBe("application/ld+json");
      expect(script).not.toHaveProperty("tag");
      expect(script).not.toHaveProperty("attrs");
      expect(Object.keys(script).sort()).toEqual(["children", "type"]);
    }
    expect(head.scripts!.map((script) => JSON.parse(script.children)["@type"])).toEqual([
      "NewsArticle",
      "BreadcrumbList",
    ]);
  });

  it("attaches a NewsArticle JSON-LD script built only from real DTO fields", () => {
    const article = detail();
    const head = buildArticleHead(article, "article-1");
    const jsonLd = JSON.parse(head.scripts![0].children!);
    expect(jsonLd["@type"]).toBe("NewsArticle");
    expect(jsonLd.headline).toBe("Titre officiel");
    expect(jsonLd.datePublished).toBe(article.publishedAt);
    expect(jsonLd.author).toEqual({ "@type": "Person", name: "Amine El Idrissi" });
    expect(jsonLd.publisher).toEqual({ "@type": "Organization", name: "BotolaGO" });
    expect(jsonLd.image).toEqual(["https://media.example.test/article.jpg"]);
  });
});

describe("buildArticleJsonLd", () => {
  it("never fabricates an author when the DTO has neither an author nor a publisher name", () => {
    const article = detail({ author: null, publisher: null });
    const jsonLd = buildArticleJsonLd(article, "https://botolago.com/news/x")!;
    expect(jsonLd.author).toBeUndefined();
    // Publisher still resolves to BotolaGO's own real identity, not a fabricated name.
    expect(jsonLd.publisher).toEqual({ "@type": "Organization", name: "BotolaGO" });
  });

  it("omits the image field when the article has no hero media", () => {
    const article = detail({ hero: null });
    const jsonLd = buildArticleJsonLd(article, "https://botolago.com/news/x")!;
    expect(jsonLd.image).toBeUndefined();
  });
});

describe("the tag the router actually renders", () => {
  /**
   * The exact mapping @tanstack/react-router applies to a head script
   * (headContentUtils.js): everything except `children` becomes an attribute,
   * and the router supplies the tag name itself.
   *
   * Replicated here because that step is what the previous shape got wrong,
   * and asserting on our own object could never have caught it -- the old test
   * checked that {tag, attrs, children} contained a `tag` of "script", which it
   * did, while the browser received `<script tag="script" attrs="[object
   * Object]">` and ran the JSON as JavaScript.
   */
  const render = (script: Record<string, unknown>) => {
    const { children, ...attrs } = script;
    return { tag: "script", attrs, children };
  };

  it("produces a real application/ld+json script", () => {
    const head = buildArticleHead(detail(), "article-1");
    const tag = render(head.scripts![0] as unknown as Record<string, unknown>);

    expect(tag.tag).toBe("script");
    expect(tag.attrs).toEqual({ type: "application/ld+json" });
    expect(JSON.stringify(tag.attrs)).not.toContain("[object Object]");
    const parsed = JSON.parse(tag.children as string) as { "@type": string };
    expect(parsed["@type"]).toBe("NewsArticle");
  });

  it("would have failed on the shape that shipped", () => {
    // The regression, spelled out: the old declaration rendered these attrs.
    const shipped = render({
      tag: "script",
      attrs: { type: "application/ld+json" },
      children: "{}",
    });
    expect(shipped.attrs).not.toEqual({ type: "application/ld+json" });
    expect(String((shipped.attrs as { attrs: unknown }).attrs)).toBe("[object Object]");
  });
});

describe("serializeJsonLd", () => {
  // The router writes head-script children with dangerouslySetInnerHTML, so an
  // editor-supplied `</script>` in a headline would close the element early and
  // leave whatever followed being parsed as markup in the document head.
  it("cannot be closed early by an editor-supplied string", () => {
    const serialized = serializeJsonLd({
      headline: '</script><img src=x onerror="alert(1)">',
      description: "<!--<script>",
    });
    expect(serialized).not.toContain("<");
    expect(serialized).not.toContain(">");
    expect(serialized.toLowerCase()).not.toContain("</script");
  });

  it("escapes the ampersand too, so an entity cannot reintroduce a bracket", () => {
    expect(serializeJsonLd({ headline: "Raja & Wydad" })).not.toContain("&");
  });

  it("round-trips: a reader of the JSON sees the original characters", () => {
    const headline = 'Wydad 2–1 Raja <"officiel"> & suite';
    const parsed = JSON.parse(serializeJsonLd({ headline })) as { headline: string };
    expect(parsed.headline).toBe(headline);
  });

  it("leaves ordinary Arabic and French copy untouched", () => {
    const jsonLd = { headline: "الوداد ينتصر", description: "Résumé officiel — journée 1" };
    expect(JSON.parse(serializeJsonLd(jsonLd))).toEqual(jsonLd);
  });
});

describe("French ↔ Arabic alternates (hreflang)", () => {
  const FR = "9b2f0c1e-0000-4000-8000-0000000000f1";
  const AR = "9b2f0c1e-0000-4000-8000-0000000000a1";

  it("a French article with a public Arabic counterpart declares both, and French as x-default", () => {
    const head = buildArticleHead(
      detail({
        id: FR,
        language: "fr",
        translations: [{ id: AR, language: "ar", slug: "ar-slug" }],
      }),
      FR,
    );
    expect(head.links).toEqual([
      { rel: "canonical", href: `https://botolago.com/news/${FR}` },
      { rel: "alternate", hrefLang: "fr", href: `https://botolago.com/news/${FR}` },
      { rel: "alternate", hrefLang: "ar", href: `https://botolago.com/news/${AR}` },
      { rel: "alternate", hrefLang: "x-default", href: `https://botolago.com/news/${FR}` },
    ]);
    expect(head.meta).toContainEqual({ property: "og:locale", content: "fr_FR" });
    expect(head.meta).toContainEqual({ property: "og:locale:alternate", content: "ar_MA" });
  });

  it("the Arabic edition declares the same set from its own side, with its own canonical", () => {
    const head = buildArticleHead(
      detail({
        id: AR,
        language: "ar",
        translations: [{ id: FR, language: "fr", slug: "fr-slug" }],
      }),
      "ar-slug",
    );
    expect(head.links[0]).toEqual({ rel: "canonical", href: `https://botolago.com/news/${AR}` });
    expect(head.links).toContainEqual({
      rel: "alternate",
      hrefLang: "ar",
      href: `https://botolago.com/news/${AR}`,
    });
    expect(head.links).toContainEqual({
      rel: "alternate",
      hrefLang: "x-default",
      href: `https://botolago.com/news/${FR}`,
    });
    expect(head.meta).toContainEqual({ property: "og:locale", content: "ar_MA" });
  });

  it("no public counterpart (missing or unpublished): no alternates at all", () => {
    for (const translations of [[], undefined]) {
      const head = buildArticleHead(detail({ id: FR, translations }), FR);
      expect(head.links).toEqual([{ rel: "canonical", href: `https://botolago.com/news/${FR}` }]);
      expect(head.meta).not.toContainEqual(
        expect.objectContaining({ property: "og:locale:alternate" }),
      );
    }
  });

  it("title, description, OG image and publication date are all present for a real article", () => {
    const head = buildArticleHead(
      detail({ seo: { title: "Titre SEO", description: "Description SEO" } }),
      "x",
    );
    for (const expected of [
      { title: "Titre SEO — BotolaGO" },
      { name: "description", content: "Description SEO" },
      { property: "og:title", content: "Titre SEO" },
      { property: "og:description", content: "Description SEO" },
      { property: "og:image", content: "https://media.example.test/article.jpg" },
      { property: "article:published_time", content: "2026-08-02T12:00:00.000Z" },
    ]) {
      expect(head.meta).toContainEqual(expected);
    }
  });
});

// Audit A11: the licensed-archive import stored `seo_title` as the headline cut
// before 60 characters plus "…", and `seo_description` as the text cut before
// 155. These are that import's real shapes (edition 2064690e…, 2026-09-25).
describe("clipped SEO copies of the headline and summary", () => {
  const TITLE =
    "Officiel : Le Wydad AC annonce la signature de l'attaquant congolais Silvère Ganvoula M'boussy (30 ans) pour une saison";
  const SUMMARY =
    "Le Wydad Athletic Club a officialisé ce mercredi la signature de l'attaquant congolais Silvère Ganvoula M'boussy, dans le cadre du mercato estival actuel.";
  const imported = () =>
    detail({
      title: TITLE,
      summary: SUMMARY,
      seo: {
        title: "Officiel : Le Wydad AC annonce la signature de l'attaquant…",
        description:
          "Le Wydad Athletic Club a officialisé ce mercredi la signature de l'attaquant congolais Silvère Ganvoula M'boussy, dans le cadre du mercato estival…",
      },
    });

  it("the NewsArticle headline is the whole headline, not the clipped copy", () => {
    const jsonLd = buildArticleJsonLd(imported(), "https://botolago.com/news/x")!;
    expect(jsonLd.headline).toBe(TITLE);
    expect(jsonLd.description).toBe(SUMMARY);
  });

  it("the title tag, social titles and breadcrumb carry it whole too", () => {
    const head = buildArticleHead(imported(), "article-1");
    expect(head.meta).toContainEqual({ title: `${TITLE} — BotolaGO` });
    expect(head.meta).toContainEqual({ property: "og:title", content: TITLE });
    expect(head.meta).toContainEqual({ name: "twitter:title", content: TITLE });
    expect(head.meta).toContainEqual({ name: "description", content: SUMMARY });
    expect(head.meta).toContainEqual({ property: "og:description", content: SUMMARY });
    const trail = JSON.parse(head.scripts![1].children) as {
      itemListElement: { name: string }[];
    };
    expect(trail.itemListElement.at(-1)!.name).toBe(TITLE);
    for (const tag of head.meta) {
      if ("content" in tag) expect(tag.content).not.toMatch(/…$/);
    }
  });

  it("an Arabic edition's clipped copies give way the same way", () => {
    const title =
      "الوداد الرياضي يعلن رسميا تعاقده مع المهاجم الكونغولي سيلفير غانفولا مبوسي لموسم واحد";
    const arabic = detail({
      language: "ar",
      title,
      seo: { title: "الوداد الرياضي يعلن رسميا تعاقده مع المهاجم الكونغولي…", description: null },
    });
    expect(buildArticleJsonLd(arabic, "https://botolago.com/news/x")!.headline).toBe(title);
  });

  it("keeps an editor's own SEO wording, and a clip of some other text", () => {
    expect(unclippedSeoText("Wydad : Ganvoula signe", TITLE)).toBe("Wydad : Ganvoula signe");
    // Ends in an ellipsis, but is not the start of the headline.
    expect(unclippedSeoText("Le mercato du Wydad continue…", TITLE)).toBe(
      "Le mercato du Wydad continue…",
    );
    // It compares with the one text it is given: a clip that runs past a
    // short summary into the body is not a copy of that summary.
    // `articleDescription` completes that one from the body (below).
    expect(
      unclippedSeoText("Court résumé. Et la suite du corps de l'article…", "Court résumé."),
    ).toBe("Court résumé. Et la suite du corps de l'article…");
  });

  it("reads three dots as an ellipsis and ignores spacing differences", () => {
    expect(unclippedSeoText("Officiel : Le  Wydad AC annonce...", TITLE)).toBe(TITLE);
  });

  it("falls back to the source text when no SEO value is stored", () => {
    expect(unclippedSeoText(null, TITLE)).toBe(TITLE);
    expect(unclippedSeoText("  ", TITLE)).toBe(TITLE);
    expect(unclippedSeoText(null, null)).toBeNull();
  });
});

// The import stored `seo_description` as the body's paragraphs joined end to
// end and clipped before 155 characters. It leaves the column empty now, but
// every published edition still carries such a copy. These editions are
// built by the importer itself (`toEdition`, and its `clip` and `articleText`
// for the SEO copies it used to store), so the stored shapes are the real
// ones.
describe("a description clipped from the body is completed from it", () => {
  const imported = (language: "fr" | "ar", paragraphs: readonly string[]) => {
    const html = paragraphs.map((paragraph) => `<p>${paragraph}</p>`).join("");
    const edition = toEdition({
      id: "1",
      language,
      url: "https://www.elbotola.com/article/2026-09-22-23-19-974.html",
      title: "Un titre d'article importé",
      author: null,
      publishedAt: "2026-09-22T22:48:00.000Z",
      html,
      translatedFrom: null,
    })!;
    return detail({
      language,
      title: edition.title,
      summary: edition.summary,
      bodyHtml: edition.bodyHtml,
      seo: {
        title: clip(edition.title, SEO_TITLE_LIMIT),
        description: clip(articleText(html).join(" "), SEO_DESCRIPTION_LIMIT),
      },
    });
  };
  const describedAs = (article: ArticleDetailDto, text: string) => {
    expect(articleDescription(article)).toBe(text);
    expect(buildArticleJsonLd(article, "https://botolago.com/news/x")!.description).toBe(text);
    const head = buildArticleHead(article, article.id);
    for (const tag of [
      { name: "description", content: text },
      { property: "og:description", content: text },
      { name: "twitter:description", content: text },
    ]) {
      expect(head.meta).toContainEqual(tag);
    }
  };

  it("a short first paragraph: the cut ran on into the next, which is kept whole", () => {
    const kicker = "Mise à jour.";
    const next =
      "La troisième journée de la Botola Pro se conclura par un affrontement de haut vol, avec le Wydad de Casablanca recevant la Jeunesse Sportive Soualem au Complexe Sportif Mohammed V à 20h.";
    const article = imported("fr", [
      kicker,
      next,
      "Actuellement troisième, Soualem vise une troisième victoire.",
    ]);
    // What the import stored: the kicker is the whole summary, and the
    // description stops in the middle of the next paragraph.
    expect(article.summary).toBe(kicker);
    expect(article.seo.description).toMatch(/^Mise à jour\. La troisième journée .*…$/);
    describedAs(article, `${kicker} ${next}`);
  });

  it("the case the review reproduced, and an Arabic one of the same shape", () => {
    const first = "Le Wydad a officialisé la signature de Silvère Ganvoula.";
    const second =
      "Le club casablancais a précisé que l'attaquant congolais s'est engagé pour une saison, avec une année supplémentaire en option.";
    describedAs(imported("fr", [first, second]), `${first} ${second}`);

    const arabicFirst =
      "أعلن نادي الوداد الرياضي تعاقده مع المهاجم الكونغولي سيلفير غانفولا مبوسي.";
    const arabicSecond =
      "وأوضح النادي في بلاغ رسمي أن اللاعب وقع عقدا لموسم واحد قابل للتجديد، على أن يلتحق بالمجموعة خلال الأسبوع الجاري.";
    const arabic = imported("ar", [
      arabicFirst,
      arabicSecond,
      "ويستعد الفريق لمواجهة الجيش الملكي.",
    ]);
    expect(arabic.seo.description).toMatch(/…$/);
    describedAs(arabic, `${arabicFirst} ${arabicSecond}`);
  });

  it("a cut that runs through several short paragraphs ends with the one it fell in", () => {
    const paragraphs = [
      "Saison 2023 - Acte 10.",
      "La 10ème journée de la Botola Pro débutera ce mardi avec trois affiches : IRT-MCO, HUSA-DHJ et OCK-RCA.",
      "L'Ittihad de Tanger recevra le Mouloudia Oujda au stade Ibn-Batouta à 16h, dans un match important pour les deux équipes.",
      "Le Raja se déplacera à Khouribga en soirée.",
    ];
    describedAs(imported("fr", paragraphs), paragraphs.slice(0, 3).join(" "));
  });

  it("a first paragraph longer than the cut is the description, whole", () => {
    const first =
      "Le Wydad Athletic Club a officialisé ce mercredi la signature de l'attaquant congolais Silvère Ganvoula M'boussy, dans le cadre du mercato estival actuel.";
    const article = imported("fr", [first, "Le joueur rejoint le groupe dès cette semaine."]);
    expect(article.summary).toBe(first);
    describedAs(article, first);
  });

  it("a first paragraph over 300 characters, whose summary is cut too, is described whole", () => {
    const first =
      "Le Raja Club Athletic a remporté le derby de Casablanca face au Wydad sur le score de deux buts à un, au terme d'une rencontre disputée devant un stade Mohammed V plein. Les Verts ont ouvert le score en première période sur un coup franc direct, avant que le Wydad n'égalise juste après la pause. Le but de la victoire est venu dans le temps additionnel.";
    const article = imported("fr", [first, "Le Raja prend la tête du classement."]);
    expect(first.length).toBeGreaterThan(300);
    expect(article.summary).toMatch(/…$/);
    describedAs(article, first);
  });

  it("text the body does not open with is not completed from it", () => {
    const body = "<p>Le Wydad a officialisé la signature de Silvère Ganvoula.</p><p>Suite.</p>";
    const described = (description: string, overrides: Partial<ArticleDetailDto> = {}) =>
      articleDescription(
        detail({ bodyHtml: body, seo: { title: null, description }, ...overrides }),
      );
    // An editor's own description.
    expect(described("Un attaquant pour une saison.")).toBe("Un attaquant pour une saison.");
    // An ellipsis on words the body does not open with.
    expect(described("Le mercato du Wydad continue…")).toBe("Le mercato du Wydad continue…");
    // A body that ends where the text before the ellipsis does: nothing was
    // cut, the ellipsis is the writer's.
    expect(
      described("La suite au prochain épisode…", {
        summary: "Et maintenant ?",
        bodyHtml: "<p>La suite au prochain épisode</p>",
      }),
    ).toBe("La suite au prochain épisode…");
  });

  it("a description clipped from a summary written apart from the body gives way to it", () => {
    const summary = "Un résumé écrit à part, qui ne reprend pas le corps de l'article.";
    expect(
      articleDescription(
        detail({ summary, seo: { title: null, description: "Un résumé écrit à part…" } }),
      ),
    ).toBe(summary);
  });

  it("with no description stored, a summary cut from the body is completed too", () => {
    const first =
      "Le Raja Club Athletic a remporté le derby de Casablanca face au Wydad sur le score de deux buts à un.";
    expect(
      articleDescription(
        detail({
          summary: "Le Raja Club Athletic a remporté le derby…",
          bodyHtml: `<p>${first}</p><p>Suite.</p>`,
          seo: { title: null, description: null },
        }),
      ),
    ).toBe(first);
    expect(articleDescription(detail({ seo: { title: null, description: null } }))).toBe(
      "Résumé officiel",
    );
  });
});

describe("the breadcrumb follows the edition's language", () => {
  const trailOf = (article: ArticleDetailDto) =>
    (
      JSON.parse(buildArticleHead(article, article.id).scripts![1].children) as {
        "@type": string;
        itemListElement: { name: string; item: string }[];
      }
    ).itemListElement;

  it("an Arabic edition's trail is Arabic, whatever language the UI is in", () => {
    const trail = trailOf(detail({ language: "ar", title: "عنوان رسمي" }));
    expect(trail.map((step) => step.name)).toEqual(["الرئيسية", "الأخبار", "عنوان رسمي"]);
    expect(trail.map((step) => step.item)).toEqual([
      "https://botolago.com/",
      "https://botolago.com/news",
      "https://botolago.com/news/article-1",
    ]);
  });

  it("a French edition's trail is French", () => {
    expect(trailOf(detail()).map((step) => step.name)).toEqual([
      "Accueil",
      "Actualités",
      "Titre officiel",
    ]);
  });

  it("uses the navigation's own words in both languages", () => {
    for (const language of ["fr", "ar"] as const) {
      expect(ARTICLE_BREADCRUMB_LABELS[language]).toEqual({
        home: dictionaries[language]["nav.home"],
        news: dictionaries[language]["nav.news"],
      });
    }
  });
});

describe("the share picture", () => {
  it("a hero replaces the root's picture with its own alt and, when known, size", () => {
    const head = buildArticleHead(detail(), "article-1");
    expect(head.meta).toContainEqual({ property: "og:image:alt", content: "Alt" });
    expect(head.meta).toContainEqual({ property: "og:image:width", content: "1600" });
    expect(head.meta).toContainEqual({ property: "og:image:height", content: "1000" });
  });

  it("a hero without alt text is described by the headline; the page gives no size of its own", () => {
    // The route's own head only: merged with the root's, whose 1200×630 the
    // page cannot drop, those still go out before the hero (see the comment
    // in buildArticleHead).
    const base = detail();
    const head = buildArticleHead(
      detail({ hero: { ...base.hero!, alt: null, width: null, height: null } }),
      "article-1",
    );
    expect(head.meta).toContainEqual({ property: "og:image:alt", content: "Titre officiel" });
    expect(head.meta).not.toContainEqual(expect.objectContaining({ property: "og:image:width" }));
  });

  it("no hero: no image of the article's own, in the tags or the NewsArticle", () => {
    // The page shows a stock photograph for the topic; it is not this
    // article's image, so structured data does not claim it.
    const article = detail({ hero: null });
    const head = buildArticleHead(article, "article-1");
    expect(head.meta).not.toContainEqual(expect.objectContaining({ property: "og:image" }));
    expect(head.meta).not.toContainEqual(expect.objectContaining({ property: "og:image:alt" }));
    expect(JSON.parse(head.scripts![0].children)).not.toHaveProperty("image");
  });
});
