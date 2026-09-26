import { describe, expect, test } from "bun:test";
import { bodyParagraphs, comparableText, ellipsisStem, readerText } from "./article-text";

describe("readerText / comparableText", () => {
  test("is the text a reader sees", () => {
    expect(comparableText("<em>Wydad</em>&nbsp;&amp; Raja  &#171;derby&#xBB;")).toBe(
      "Wydad & Raja «derby»",
    );
  });

  test("decodes an entity encoded twice, as a few imported summaries carry them", () => {
    expect(readerText("Le Raja &amp;quot;INWI&amp;quot;")).toBe('Le Raja "INWI"');
  });

  test("leaves an unknown or impossible entity as written", () => {
    expect(comparableText("&unknown; &#x110000;")).toBe("&unknown; &#x110000;");
  });

  test("only the comparable form folds compatibility characters", () => {
    // What is shown keeps the writer's ellipsis; what is compared reads it as dots.
    expect(readerText("Et puis…")).toBe("Et puis…");
    expect(comparableText("Et puis…")).toBe("Et puis...");
  });
});

describe("ellipsisStem", () => {
  test("the text before a closing ellipsis, in either spelling", () => {
    expect(ellipsisStem("Le Wydad annonce…")).toBe("Le Wydad annonce");
    expect(ellipsisStem("Le Wydad annonce ...")).toBe("Le Wydad annonce");
    expect(ellipsisStem("Le Wydad annonce.")).toBeNull();
  });
});

describe("bodyParagraphs", () => {
  test("one entry per block of text, in reading order", () => {
    expect(
      bodyParagraphs(
        "<p>Un&nbsp;<strong>deux</strong></p><h2>Titre</h2><ul><li>Point</li><li>Autre</li></ul>" +
          '<figure><img src="https://x.test/a.jpg"><figcaption>Légende</figcaption></figure>' +
          "<blockquote><p>Cité</p></blockquote><p>Fin<br>de ligne</p>",
      ),
    ).toEqual(["Un deux", "Titre", "Point", "Autre", "Légende", "Cité", "Fin de ligne"]);
  });

  test("drops blocks with no text", () => {
    expect(bodyParagraphs("<p> </p><hr><p>Texte</p>")).toEqual(["Texte"]);
  });
});
