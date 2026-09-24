import { describe, expect, test } from "bun:test";
import {
  articleText,
  batchSql,
  buildStories,
  toEdition,
  type ElbotolaArticle,
} from "./elbotola-licensed-import";

function article(overrides: Partial<ElbotolaArticle> = {}): ElbotolaArticle {
  return {
    id: "ar-1",
    language: "ar",
    url: "https://www.elbotola.com/article/2026-09-22-23-19-974.html",
    title: "أمل تزنيت يعلن منع تنقل جماهير اتحاد طنجة",
    author: "ف.ز (البطولة)",
    publishedAt: "2026-09-22T22:48:00.000Z",
    html:
      '<p>أعلن <a class="article_tag" href="/analytics/team/x">نادي أمل تزنيت</a>، في بلاغ رسمي، عن منع الجماهير.</p>' +
      "<p>ويستقبل أمل تزنيت ضيفه اتحاد طنجة يوم الخميس.</p>",
    translatedFrom: null,
    ...overrides,
  };
}

describe("article text", () => {
  test("keeps the words of ElBotola's tag links but not the links", () => {
    expect(articleText(article().html)).toEqual([
      "أعلن نادي أمل تزنيت، في بلاغ رسمي، عن منع الجماهير.",
      "ويستقبل أمل تزنيت ضيفه اتحاد طنجة يوم الخميس.",
    ]);
  });

  test("drops scripts, embeds and images, and decodes entities", () => {
    expect(
      articleText(
        '<p>Avant &amp; après&nbsp;le match</p><script>x()</script><iframe src="y"></iframe><figure><img src="z"></figure>',
      ),
    ).toEqual(["Avant & après le match"]);
  });

  test("an edition carries paragraphs only, the original date and the journalist", () => {
    const edition = toEdition(article())!;
    expect(edition.slug).toBe("elbotola-2026-09-22-23-19-974");
    expect(edition.bodyHtml).not.toContain("<a");
    expect(edition.bodyHtml.startsWith("<p>")).toBe(true);
    expect(edition.publishedAt).toBe("2026-09-22T22:48:00.000Z");
    expect(edition.author).toBe("ف.ز (البطولة)");
    expect(edition.summary).toBe("أعلن نادي أمل تزنيت، في بلاغ رسمي، عن منع الجماهير.");
  });

  test("markup injected into the text is escaped, not rendered", () => {
    const edition = toEdition(
      article({
        html: "<p>Texte &lt;script&gt;alert(1)&lt;/script&gt; assez long pour passer.</p>",
      }),
    )!;
    expect(edition.bodyHtml).not.toContain("<script");
  });

  test("an empty or too-short article is unusable", () => {
    expect(toEdition(article({ html: "<p></p>" }))).toBeNull();
    expect(toEdition(article({ html: "<p>Court.</p>" }))).toBeNull();
  });
});

describe("stories", () => {
  const french = article({
    id: "fr-1",
    language: "fr",
    url: "https://www.elbotola.com/article/2026-09-22-23-19-585.html",
    title: "Amal Tiznit interdit le déplacement des supporters",
    author: "T.F (Elbotola)",
    html: "<p>Le club d'Amal Tiznit a annoncé une interdiction de déplacement.</p>",
    translatedFrom: "ar-1",
  });

  test("a French translation joins its Arabic original as one story", () => {
    const { stories } = buildStories([article()], [french], new Set());
    expect(stories).toHaveLength(1);
    expect(stories[0]!.canonicalUrl).toBe(article().url);
    expect(stories[0]!.editions.map((edition) => edition.language)).toEqual(["ar", "fr"]);
  });

  test("a French article without an Arabic original is French-only, with no original to link", () => {
    const { stories } = buildStories([], [french], new Set());
    expect(stories).toHaveLength(1);
    expect(stories[0]!.originalLanguage).toBe("fr");
    expect(stories[0]!.canonicalUrl).toBeNull();
  });

  test("an original BotolaGO already holds is skipped, and the key is stable across runs", () => {
    const first = buildStories([article()], [], new Set());
    const again = buildStories([article()], [], new Set());
    expect(first.stories[0]!.fingerprint).toBe(again.stories[0]!.fingerprint);
    expect(buildStories([article()], [french], new Set([article().url])).skippedExisting).toBe(1);
  });
});

describe("batch SQL", () => {
  const { stories } = buildStories(
    [article({ title: "L'Ittihad de Tanger en stage fermé" })],
    [],
    new Set(),
  );

  test("quotes every value and writes private drafts only", () => {
    const sql = batchSql(stories, false);
    expect(sql).toContain("'L''Ittihad de Tanger en stage fermé'");
    expect(sql).toContain("'draft', 'private'");
    expect(sql).not.toContain("'published'");
    expect(sql).toContain("guard: ElBotola has no recorded licence");
  });

  test("a dry run always ends by rolling back", () => {
    expect(batchSql(stories, true)).toContain("raise exception 'DRY_RUN_ROLLBACK");
    expect(batchSql(stories, false)).not.toContain("DRY_RUN_ROLLBACK");
  });
});
