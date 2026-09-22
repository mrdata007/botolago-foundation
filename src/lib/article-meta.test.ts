import { describe, expect, it } from "vitest";
import {
  buildArticleHead,
  buildArticleJsonLd,
  buildCanonicalArticleUrl,
  serializeJsonLd,
} from "./article-meta";
import type { ArticleDetailDto } from "@/backend/news/contracts";

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

  it("surfaces a distinct modified time only when updatedAt differs from publishedAt", () => {
    const updated = detail({ updatedAt: "2026-08-03T09:00:00.000Z" });
    const head = buildArticleHead(updated, "article-1");
    expect(head.meta).toContainEqual({
      property: "article:modified_time",
      content: "2026-08-03T09:00:00.000Z",
    });
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
    const head = buildArticleHead(detail(), "article-1");
    expect(head.scripts).toHaveLength(1);
    const script = head.scripts![0];
    expect(script.type).toBe("application/ld+json");
    expect(script).not.toHaveProperty("tag");
    expect(script).not.toHaveProperty("attrs");
    expect(Object.keys(script).sort()).toEqual(["children", "type"]);
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
