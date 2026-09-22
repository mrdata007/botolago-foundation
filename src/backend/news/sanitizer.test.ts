import { describe, expect, test } from "bun:test";
import { calculateReadingTime, NEWS_SANITIZER_VERSION, sanitizeEditorialHtml } from "./sanitizer";

describe("editorial sanitizer", () => {
  test("removes executable markup and unsafe protocols", () => {
    const clean = sanitizeEditorialHtml(
      '<p onclick="evil()">Safe editorial paragraph long enough.</p><script>alert(1)</script><a href="javascript:evil()">link</a>',
    );
    expect(clean).not.toContain("script");
    expect(clean).not.toContain("onclick");
    expect(clean).not.toContain("javascript:");
    // The unsafe href is gone, so what is left is not a link at all.
    expect(clean).toContain("<a>link</a>");
  });

  test("external https links open in a new tab with nofollow noopener noreferrer", () => {
    const clean = sanitizeEditorialHtml(
      '<p>Source officielle : <a href="https://www.frmf.ma/x" rel="opener" target="_self">FRMF</a>.</p>',
    );
    expect(clean).toBe(
      '<p>Source officielle : <a href="https://www.frmf.ma/x" target="_blank" rel="nofollow noopener noreferrer">FRMF</a>.</p>',
    );
  });

  test("internal links (paths and botolago.com) carry neither target nor rel", () => {
    const clean = sanitizeEditorialHtml(
      '<p>Voir <a href="/matches" target="_blank" rel="nofollow">les matchs</a> et <a href="https://www.botolago.com/news/x">cet article</a>.</p>',
    );
    expect(clean).toBe(
      '<p>Voir <a href="/matches">les matchs</a> et <a href="https://www.botolago.com/news/x">cet article</a>.</p>',
    );
  });

  test("a look-alike host is external, not internal", () => {
    const clean = sanitizeEditorialHtml(
      '<p>Un lien <a href="https://botolago.com.evil.test/x">piège</a> assez long ici.</p>',
    );
    expect(clean).toContain('rel="nofollow noopener noreferrer"');
  });

  test("every unsafe scheme loses its href; no iframe, object, embed or script survives", () => {
    const clean = sanitizeEditorialHtml(
      [
        "<p>Paragraphe de test suffisamment long.</p>",
        '<p><a href="javascript:alert(1)">a</a><a href="JaVaScRiPt:alert(1)">b</a>',
        '<a href="data:text/html,<script>x</script>">c</a><a href="http://insecure.test">d</a>',
        '<a href="//evil.test">e</a><a href="vbscript:x">f</a></p>',
        '<iframe src="https://x.test"></iframe><object data="x"></object><embed src="x">',
        '<script src="https://cdn.test/x.js"></script><img src="x" onerror="alert(1)">',
      ].join(""),
    );
    for (const needle of [
      "href=",
      "iframe",
      "object",
      "embed",
      "script",
      "onerror",
      "javascript",
      "data:",
    ]) {
      expect(`${needle}: ${clean.toLowerCase().includes(needle)}`).toBe(`${needle}: false`);
    }
  });

  test("uses a pinned version and deterministic reading time", () => {
    expect(NEWS_SANITIZER_VERSION).toBe("sanitize-html@2.17.5");
    expect(calculateReadingTime(`<p>${"word ".repeat(221)}</p>`)).toBe(2);
  });
});
