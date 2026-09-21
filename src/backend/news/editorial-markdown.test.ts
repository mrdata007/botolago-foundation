import { describe, expect, test } from "bun:test";
import {
  editorialHtmlToMarkdown,
  editorialImageMarkdown,
  insertMarkdownBlockAtSelection,
  isAllowedEditorialImageUrl,
  markdownToEditorialHtml,
} from "./editorial-markdown";
import { sanitizeEditorialHtml } from "./sanitizer";

const IMAGE_URL =
  "https://botolago-test.supabase.co/storage/v1/object/public/news-media/news/a.webp";

describe("markdownToEditorialHtml", () => {
  test("keeps the original paragraph behaviour for image-free content", () => {
    expect(markdownToEditorialHtml("Premier bloc.\n\nSecond bloc.")).toBe(
      "<p>Premier bloc.</p><p>Second bloc.</p>",
    );
  });

  test("renders a standalone image as a figure with a figcaption", () => {
    expect(markdownToEditorialHtml(`![Le Raja marque](${IMAGE_URL})`)).toBe(
      `<figure><img src="${IMAGE_URL}" alt="Le Raja marque" /><figcaption>Le Raja marque</figcaption></figure>`,
    );
  });

  test("omits the figcaption when there is no alt text", () => {
    const html = markdownToEditorialHtml(`![](${IMAGE_URL})`);
    expect(html).toBe(`<figure><img src="${IMAGE_URL}" alt="" /></figure>`);
    expect(html).not.toContain("figcaption");
  });

  test("lifts an inline image out of its surrounding paragraph text", () => {
    expect(markdownToEditorialHtml(`Avant\n![Alt](${IMAGE_URL})\nAprès`)).toBe(
      `<p>Avant</p><figure><img src="${IMAGE_URL}" alt="Alt" /><figcaption>Alt</figcaption></figure><p>Après</p>`,
    );
  });

  test("escapes alt text instead of letting it inject markup", () => {
    const html = markdownToEditorialHtml(`![" onerror="evil()](${IMAGE_URL})`);
    expect(html).toContain('alt="&quot; onerror=&quot;evil()"');
    expect(html).not.toContain('onerror="evil()"');
  });

  test("refuses every non-https URL and leaves the literal text in place", () => {
    for (const url of [
      "javascript:alert(1)",
      "http://example.com/a.png",
      "//example.com/a.png",
      "data:image/png;base64,AAA",
      "https://user:pass@example.com/a.png",
    ]) {
      const html = markdownToEditorialHtml(`![Alt](${url})`);
      expect(html).not.toContain("<img");
      expect(html).toBe(`<p>![Alt](${url})</p>`);
      expect(isAllowedEditorialImageUrl(url)).toBe(false);
    }
  });
});

describe("sanitizer compatibility", () => {
  test("the generated figure survives sanitizeEditorialHtml with src and alt intact", () => {
    const html = markdownToEditorialHtml(
      `Un paragraphe suffisamment long.\n\n![Le Raja marque](${IMAGE_URL})`,
    );
    const clean = sanitizeEditorialHtml(html);
    expect(clean).toContain("<figure>");
    expect(clean).toContain("</figure>");
    expect(clean).toContain(`src="${IMAGE_URL}"`);
    expect(clean).toContain('alt="Le Raja marque"');
    expect(clean).toContain("<figcaption>Le Raja marque</figcaption>");
    expect(clean).toContain("<p>Un paragraphe suffisamment long.</p>");
    // The policy's only transform on images is the forced lazy loading.
    expect(clean.replace(' loading="lazy"', "")).toBe(html);
  });
});

describe("editorialHtmlToMarkdown", () => {
  test("still unwraps plain paragraphs", () => {
    expect(editorialHtmlToMarkdown("<p>Premier bloc.</p><p>Second bloc.</p>")).toBe(
      "Premier bloc.\n\nSecond bloc.",
    );
  });

  test("turns a sanitized figure back into image markdown", () => {
    expect(
      editorialHtmlToMarkdown(
        `<figure><img src="${IMAGE_URL}" alt="Le Raja marque" loading="lazy" /><figcaption>Le Raja marque</figcaption></figure>`,
      ),
    ).toBe(`![Le Raja marque](${IMAGE_URL})`);
  });

  test("round-trips markdown with images through HTML and the sanitizer", () => {
    const markdown = [
      "Un paragraphe suffisamment long pour le sanitizer.",
      `![Le Raja marque](${IMAGE_URL})`,
      "Une légende de fin.",
      `![](${IMAGE_URL})`,
    ].join("\n\n");

    const once = sanitizeEditorialHtml(markdownToEditorialHtml(markdown));
    expect(editorialHtmlToMarkdown(once)).toBe(markdown);
    // Re-saving the reconstructed markdown must not drift either.
    expect(sanitizeEditorialHtml(markdownToEditorialHtml(editorialHtmlToMarkdown(once)))).toBe(
      once,
    );
  });

  test("round-trips alt text containing HTML-significant characters", () => {
    const markdown = `Texte assez long pour passer le sanitizer.\n\n![Wydad & "RCA" <derby>](${IMAGE_URL})`;
    const html = sanitizeEditorialHtml(markdownToEditorialHtml(markdown));
    expect(editorialHtmlToMarkdown(html)).toBe(markdown);
  });

  test("drops an image whose src is not https rather than emitting it", () => {
    expect(
      editorialHtmlToMarkdown('<p>Texte.</p><img src="http://evil.test/a.png" alt="x" />'),
    ).toBe("Texte.");
  });
});

describe("insertMarkdownBlockAtSelection", () => {
  const snippet = editorialImageMarkdown(IMAGE_URL, "Alt");

  test("inserts at the caret, not at the end", () => {
    const result = insertMarkdownBlockAtSelection("Avant.\n\nAprès.", 7, 7, snippet);
    expect(result.value).toBe(`Avant.\n\n${snippet}\n\nAprès.`);
    expect(result.value.slice(0, result.caret)).toBe(`Avant.\n\n${snippet}`);
  });

  test("replaces the current selection", () => {
    const result = insertMarkdownBlockAtSelection("Avant.", 0, 6, snippet);
    expect(result.value).toBe(snippet);
    expect(result.caret).toBe(snippet.length);
  });

  test("adds the blank lines the block converter needs", () => {
    const result = insertMarkdownBlockAtSelection("Avant.", 6, 6, snippet);
    expect(result.value).toBe(`Avant.\n\n${snippet}`);
    expect(markdownToEditorialHtml(result.value)).toBe(
      `<p>Avant.</p><figure><img src="${IMAGE_URL}" alt="Alt" /><figcaption>Alt</figcaption></figure>`,
    );
  });

  test("clamps out-of-range selections", () => {
    const result = insertMarkdownBlockAtSelection("Avant.", 999, 999, snippet);
    expect(result.value).toBe(`Avant.\n\n${snippet}`);
  });

  test("strips bracket characters that would break the markdown syntax", () => {
    expect(editorialImageMarkdown(IMAGE_URL, " [Alt] ")).toBe(`![Alt](${IMAGE_URL})`);
  });
});

describe("attribute reading is not fooled by a prefixed attribute name", () => {
  // Regression: the reader matched on a word boundary, and a hyphen is a
  // non-word character, so `\bsrc` matched inside `data-src`. Whichever such
  // attribute came first won -- silently rewriting a stored image to a
  // different URL, or replacing its alt text, the next time an editor saved.
  const REAL = "https://cdn.test/real.webp";
  const OTHER = "https://attacker.test/other.png";

  test("reads src, not data-src, whichever comes first", () => {
    expect(
      editorialHtmlToMarkdown(`<figure><img data-src="${OTHER}" src="${REAL}" /></figure>`),
    ).toBe(`![](${REAL})`);
    expect(
      editorialHtmlToMarkdown(`<figure><img src="${REAL}" data-src="${OTHER}" /></figure>`),
    ).toBe(`![](${REAL})`);
  });

  test("reads alt, not data-alt, whichever comes first", () => {
    expect(
      editorialHtmlToMarkdown(
        `<figure><img data-alt="WRONG" src="${REAL}" alt="RIGHT" /></figure>`,
      ),
    ).toBe(`![RIGHT](${REAL})`);
    expect(
      editorialHtmlToMarkdown(
        `<figure><img src="${REAL}" alt="RIGHT" data-alt="WRONG" /></figure>`,
      ),
    ).toBe(`![RIGHT](${REAL})`);
  });

  test("ignores any attribute merely ending in the wanted name", () => {
    for (const decoy of ["data-src", "x-src", "my:src", "foosrc"]) {
      const html = `<figure><img ${decoy}="${OTHER}" src="${REAL}" /></figure>`;
      expect(editorialHtmlToMarkdown(html)).toBe(`![](${REAL})`);
    }
  });

  test("does not let a decoy attribute smuggle in a disallowed URL", () => {
    // The decoy carries a scheme the policy forbids. If it were read as src,
    // the https-only guard would reject it and the image would vanish from the
    // article entirely -- content loss rather than a bad link.
    const html = `<figure><img data-src="javascript:alert(1)" src="${REAL}" /></figure>`;
    expect(editorialHtmlToMarkdown(html)).toBe(`![](${REAL})`);
  });

  test("still reads a normally-formed tag", () => {
    expect(editorialHtmlToMarkdown(`<figure><img src="${REAL}" alt="Le derby" /></figure>`)).toBe(
      `![Le derby](${REAL})`,
    );
  });
});
