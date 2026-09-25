import { describe, expect, test } from "bun:test";
import { articleLeadPlacement, firstParagraphHtml } from "./article-lead";

// Shapes taken from the published archive on 2026-09-25: the imported body is
// one <p> per paragraph, and the summary is the first paragraph, whole or cut
// at 300 characters with "…".
const LEAD =
  "Le Wydad Athletic Club a officialisé ce mercredi la signature de l'attaquant congolais Silvère Ganvoula M'boussy, dans le cadre du mercato estival actuel.";
const SECOND =
  "<p>Le club casablancais a précisé que Ganvoula M'boussy s'est engagé pour une saison.</p>";

describe("articleLeadPlacement", () => {
  test("a body that opens with the deck's text: shown once, as the body's first paragraph", () => {
    expect(articleLeadPlacement(LEAD, `<p>${LEAD}</p>${SECOND}`)).toBe("body");
  });

  test("the same in an Arabic edition", () => {
    const lead =
      "أعلن نادي الوداد الرياضي، اليوم الأربعاء، تعاقده مع المهاجم الكونغولي سيلفير غانفولا مبوسي.";
    expect(articleLeadPlacement(lead, `<p>${lead}</p><p>وقّع اللاعب لموسم واحد.</p>`)).toBe("body");
  });

  test("differences a reader cannot see do not count: entities, markup, spacing", () => {
    // The body escapes what the summary stores as plain text, or the other
    // way round (a few imported summaries carry `&quot;`, even `&amp;quot;`).
    expect(
      articleLeadPlacement(
        "Le Raja s'impose face à l'AS FAR &amp;quot;INWI&amp;quot;.",
        "<p>Le Raja s&#x27;impose  face à l'AS&nbsp;FAR <strong>&quot;INWI&quot;</strong>.</p>",
      ),
    ).toBe("body");
    expect(
      articleLeadPlacement("Une ligne. Et une autre.", "\n  <p>Une ligne.<br>Et une autre.</p>"),
    ).toBe("body");
  });

  test("a deck that is the opening paragraph cut short gives way to the paragraph", () => {
    const paragraph = `${LEAD} Le joueur, passé par plusieurs clubs européens, rejoint le groupe dès cette semaine.`;
    const cut = `${paragraph.slice(0, 180).replace(/\s+\S*$/, "")}…`;
    expect(articleLeadPlacement(cut, `<p>${paragraph}</p>${SECOND}`)).toBe("none");
    expect(articleLeadPlacement(cut.replace(/…$/, "..."), `<p>${paragraph}</p>`)).toBe("none");
  });

  test("a paragraph that merely starts the same way keeps both", () => {
    // No ellipsis: the deck is a sentence of its own, not a cut.
    expect(articleLeadPlacement(LEAD, `<p>${LEAD} Le joueur arrive libre.</p>`)).toBe("deck");
    // The other way round: the deck says more than the paragraph.
    expect(articleLeadPlacement(`${LEAD} Il arrive libre.`, `<p>${LEAD}</p>`)).toBe("deck");
    // A teaser too short to be a cut of the paragraph.
    expect(articleLeadPlacement("Le Wydad Athletic…", `<p>${LEAD}</p>`)).toBe("deck");
    // An ellipsis on a deck that diverges from the paragraph.
    expect(
      articleLeadPlacement("Le Wydad Athletic Club a annoncé une recrue…", `<p>${LEAD}</p>`),
    ).toBe("deck");
  });

  test("an editor's deck that is not the body's opening stays", () => {
    expect(articleLeadPlacement("Un attaquant pour une saison.", `<p>${LEAD}</p>${SECOND}`)).toBe(
      "deck",
    );
  });

  test("the deck is compared with the body's first paragraph, after a heading or a figure", () => {
    // A CMS body may open with a heading or a picture: the lead paragraph
    // after it is still the first paragraph, and is still shown once.
    expect(articleLeadPlacement(LEAD, `<h2>Officiel</h2><p>${LEAD}</p>${SECOND}`)).toBe("body");
    expect(
      articleLeadPlacement(LEAD, `<figure><img src="https://x.test/a.jpg"></figure><p>${LEAD}</p>`),
    ).toBe("body");
  });

  test("only the first paragraph counts, and only one at the top level", () => {
    // The deck repeated further down is not the first paragraph.
    expect(articleLeadPlacement(LEAD, `${SECOND}<p>${LEAD}</p>`)).toBe("deck");
    // Nor is a paragraph inside a quote or a list: the body's first
    // paragraph is the one after it.
    expect(articleLeadPlacement(LEAD, `<blockquote><p>${LEAD}</p></blockquote>${SECOND}`)).toBe(
      "deck",
    );
    expect(articleLeadPlacement(LEAD, `<ul><li><p>${LEAD}</p></li></ul>${SECOND}`)).toBe("deck");
    // No paragraph at all.
    expect(articleLeadPlacement(LEAD, `<h2>${LEAD}</h2>`)).toBe("deck");
  });

  test("no deck, nothing to place", () => {
    expect(articleLeadPlacement(null, `<p>${LEAD}</p>`)).toBe("none");
    expect(articleLeadPlacement("   ", `<p>${LEAD}</p>`)).toBe("none");
  });
});

describe("firstParagraphHtml", () => {
  test("is the first <p> at the top level of the body", () => {
    expect(firstParagraphHtml("<p>Un <strong>deux</strong><br>trois</p><p>quatre</p>")).toBe(
      "Un <strong>deux</strong><br>trois",
    );
    expect(
      firstParagraphHtml(
        '<figure><img src="https://x.test/a.jpg"><figcaption>Légende</figcaption></figure><hr><p>Après</p>',
      ),
    ).toBe("Après");
    expect(firstParagraphHtml("<blockquote><p>Cité</p></blockquote><p>Corps</p>")).toBe("Corps");
  });

  test("none: no paragraph at the top level, or one left open", () => {
    expect(firstParagraphHtml("<h2>Titre</h2><ul><li><p>Point</p></li></ul>")).toBeNull();
    expect(firstParagraphHtml("<p>Sans fin")).toBeNull();
  });
});
