import { describe, expect, test } from "bun:test";
import { articleDescription, articleHeadline } from "../../src/lib/article-meta";
import {
  articleText,
  batchSql,
  buildStories,
  clip,
  readRuntime,
  SEO_DESCRIPTION_LIMIT,
  SEO_TITLE_LIMIT,
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

/** Longer than a search result shows: 114 characters, and a first paragraph of 409. */
const longTitle =
  "Le Wydad annonce le début de la distribution des cartes d'abonnement pour la nouvelle saison sportive dès ce mardi";
const longText = `<p>${"Le Wydad Athletic Club a annoncé le lancement de la distribution des abonnements. ".repeat(5)}</p>`;

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

  test("a headline or text too long for a search result is left empty, never stored cut", () => {
    // It used to store the headline cut before 60 characters and the text
    // before 155, each closed with "…": copies that only lose words.
    const long = toEdition(article({ title: longTitle, html: longText }))!;
    expect(long.title).toBe(longTitle);
    expect(long.seoTitle).toBeNull();
    expect(long.seoDescription).toBeNull();
  });

  test("a headline and text that fit a search result are stored whole", () => {
    const short = toEdition(article())!;
    expect(short.seoTitle).toBe(short.title);
    expect(short.seoDescription).toBe(articleText(article().html).join(" "));
    expect(`${short.seoTitle} ${short.seoDescription}`).not.toContain("…");
  });

  test("at the search length it is whole; one character over, empty", () => {
    const sized = (length: number) => `Botola ${"x".repeat(length - 7)}`;
    const edition = (title: string, text: string) =>
      toEdition(article({ title, html: `<p>${text}</p>` }))!;
    const fits = edition(sized(SEO_TITLE_LIMIT), sized(SEO_DESCRIPTION_LIMIT));
    expect(fits.seoTitle).toBe(sized(SEO_TITLE_LIMIT));
    expect(fits.seoDescription).toBe(sized(SEO_DESCRIPTION_LIMIT));
    const over = edition(sized(SEO_TITLE_LIMIT + 1), sized(SEO_DESCRIPTION_LIMIT + 1));
    expect(over.seoTitle).toBeNull();
    expect(over.seoDescription).toBeNull();
  });

  test("the page presents an edition without SEO copies under its whole headline and lead", () => {
    // What the site does with the empty columns (src/lib/article-meta.ts).
    const long = toEdition(article({ title: longTitle, html: longText }))!;
    const presented = {
      title: long.title,
      summary: long.summary,
      bodyHtml: long.bodyHtml,
      seo: { title: long.seoTitle, description: long.seoDescription },
    };
    expect(articleHeadline(presented)).toBe(longTitle);
    // A first paragraph over 300 characters: the summary is cut, and the
    // page completes it from the body, as it does the archive's clipped
    // descriptions.
    expect(long.summary).toMatch(/…$/);
    expect(articleDescription(presented)).toBe(articleText(longText)[0]);
  });

  test("a text opening with a short kicker is described by the kicker alone", () => {
    // The page runs a lead on to the end of the paragraph a cut fell in only
    // when the lead ends in an ellipsis. The archive's clipped copy of this
    // text is completed to the kicker and the whole next paragraph; an
    // edition imported now has no copy, and its summary is the kicker.
    // Running a short summary on the same way is src/lib/article-meta.ts's
    // to do, and when it does, the first description below becomes the
    // second.
    const kicker = "Mise à jour.";
    const next =
      "La troisième journée de la Botola Pro se conclura par un affrontement de haut vol, avec le Wydad de Casablanca recevant la Jeunesse Sportive Soualem au Complexe Sportif Mohammed V à 20h.";
    const html = [kicker, next, "Actuellement troisième, Soualem vise une troisième victoire."]
      .map((paragraph) => `<p>${paragraph}</p>`)
      .join("");
    const edition = toEdition(article({ language: "fr", html }))!;
    const describedWith = (description: string | null) =>
      articleDescription({
        summary: edition.summary,
        bodyHtml: edition.bodyHtml,
        seo: { title: null, description },
      });
    expect(edition.seoDescription).toBeNull();
    expect(edition.summary).toBe(kicker);
    expect(describedWith(edition.seoDescription)).toBe(kicker);
    // The archive's copy of the same text: cut by the old import, completed
    // by the page.
    expect(describedWith(clip(articleText(html).join(" "), SEO_DESCRIPTION_LIMIT))).toBe(
      `${kicker} ${next}`,
    );
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

  test("an SEO title or description left empty is written as SQL null", () => {
    const [long] = buildStories(
      [article({ title: longTitle, html: longText })],
      [],
      new Set(),
    ).stories;
    // The row's last three values: author, seo_title, seo_description.
    expect(batchSql([long!], false)).toContain("'ف.ز (البطولة)', null, null)");
    // Stored whole when they fit.
    expect(batchSql(stories, false)).toContain(
      "'ف.ز (البطولة)', 'L''Ittihad de Tanger en stage fermé', 'أعلن نادي أمل تزنيت، في بلاغ رسمي، عن منع الجماهير. ويستقبل أمل تزنيت ضيفه اتحاد طنجة يوم الخميس.')",
    );
  });
});
