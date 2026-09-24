import { describe, expect, test } from "bun:test";
import {
  articleText,
  batchSql,
  buildStories,
  readRuntime,
  selectFeed,
  toEdition,
  withoutUnreadOriginals,
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

  test("every edition carries an SEO title and description within search lengths", () => {
    const long = toEdition(
      article({
        title:
          "Le Wydad annonce le début de la distribution des cartes d'abonnement pour la nouvelle saison sportive dès ce mardi",
        html: `<p>${"Le Wydad Athletic Club a annoncé le lancement de la distribution des abonnements. ".repeat(5)}</p>`,
      }),
    )!;
    expect(long.seoTitle.length).toBeLessThanOrEqual(60);
    expect(long.seoTitle.endsWith("…")).toBe(true);
    expect(long.seoTitle.startsWith("Le Wydad annonce le début")).toBe(true);
    expect(long.seoDescription.length).toBeLessThanOrEqual(155);
    expect(long.seoDescription.length).toBeGreaterThan(100);

    const short = toEdition(article())!;
    expect(short.seoTitle).toBe(short.title);
    expect(short.seoDescription.length).toBeGreaterThan(10);
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

describe("feed selection", () => {
  const item = (id: string, day: number) => ({
    object_id: id,
    absolute_url: `https://www.elbotola.com/article/${id}.html`,
    pub_date: 1_790_000_000 + day * 86_400,
  });
  const arabic = [item("a5", 5), item("a4", 4), item("a3", 3), item("a2", 2), item("a1", 1)];
  const french = [item("f5", 5), item("f3", 3), item("f1", 1)];

  test("a limit reads only the newest Arabic articles and the French of the same days", () => {
    const picked = selectFeed(arabic, french, 2);
    expect(picked.arabic.map((entry) => entry.object_id)).toEqual(["a5", "a4"]);
    expect(picked.french.map((entry) => entry.object_id)).toEqual(["f5"]);
  });

  test("no limit reads everything", () => {
    const picked = selectFeed(arabic, french, null);
    expect(picked.arabic).toHaveLength(5);
    expect(picked.french).toHaveLength(3);
  });

  test("a limit is for practice runs only; an import reads the whole feed", () => {
    const env = {
      CONFIRMATION: "RUN_ELBOTOLA_LICENSED_IMPORT",
      EXPECTED_COMMIT: "abc",
      GITHUB_SHA: "abc",
      IMPORT_STATUS: "published",
      SUPABASE_ACCESS_TOKEN: "token",
      SUPABASE_PRODUCTION_PROJECT_REF: "abcdefghijklmnopqrst",
      IMPORT_LIMIT: "200",
    };
    expect(readRuntime({ ...env, IMPORT_MODE: "dry-run" }).limit).toBe(200);
    expect(() => readRuntime({ ...env, IMPORT_MODE: "import" })).toThrow("dry runs only");
    expect(readRuntime({ ...env, IMPORT_MODE: "import", IMPORT_LIMIT: "" }).limit).toBeNull();
  });

  test("a translation whose original was not read is held back, not imported alone", () => {
    const original = article();
    const translation = article({ id: "fr-1", language: "fr", translatedFrom: "ar-1" });
    const orphan = article({ id: "fr-2", language: "fr", translatedFrom: "ar-older" });
    const frenchOnly = article({ id: "fr-3", language: "fr", translatedFrom: null });
    expect(
      withoutUnreadOriginals([original], [translation, orphan, frenchOnly]).map((a) => a.id),
    ).toEqual(["fr-1", "fr-3"]);
  });
});

describe("batch SQL", () => {
  const { stories } = buildStories(
    [article({ title: "L'Ittihad de Tanger en stage fermé" })],
    [],
    new Set(),
  );

  test("quotes every value and, by default, writes private drafts only", () => {
    const sql = batchSql(stories, false);
    expect(sql).toContain("'L''Ittihad de Tanger en stage fermé'");
    expect(sql).toContain("'draft', 'private'");
    expect(sql).not.toContain("'published'");
    expect(sql).toContain("guard: ElBotola has no recorded licence");
  });

  test("published writes public editions keeping ElBotola's date", () => {
    const sql = batchSql(stories, false, "published");
    expect(sql).toContain("'published', 'public', b.published_at");
    expect(sql).not.toContain("'draft', 'private'");
  });

  test("provider text containing a dollar-quote tag cannot end the block early", () => {
    const hostile = buildStories(
      [
        article({
          html: "<p>Texte assez long pour passer $import$; drop table app.stories; --</p>",
        }),
      ],
      [],
      new Set(),
    ).stories;
    const sql = batchSql(hostile, false);
    const tag = /^do (\$import_[0-9a-f]{24}\$)/.exec(sql)?.[1];
    expect(tag).toBeDefined();
    expect(sql.trimEnd().endsWith(`${tag};`)).toBe(true);
    // The random tag appears exactly twice: opening and closing the body.
    expect(sql.split(tag!).length - 1).toBe(2);
    expect(batchSql(hostile, false)).not.toContain(tag!);
  });

  test("a batch whose text contains its own delimiter is refused", () => {
    const tag = "$import_fixed$";
    const hostile = buildStories(
      [article({ html: `<p>Texte assez long pour passer ${tag} et la suite.</p>` })],
      [],
      new Set(),
    ).stories;
    expect(() => batchSql(hostile, false, "draft", tag)).toThrow("batch delimiter");
  });

  test("a dry run always ends by rolling back", () => {
    expect(batchSql(stories, true)).toContain("raise exception 'DRY_RUN_ROLLBACK");
    expect(batchSql(stories, false)).not.toContain("DRY_RUN_ROLLBACK");
  });
});
