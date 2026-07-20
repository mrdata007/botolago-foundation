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
    expect(clean).toContain('rel="nofollow noopener noreferrer"');
  });

  test("uses a pinned version and deterministic reading time", () => {
    expect(NEWS_SANITIZER_VERSION).toBe("sanitize-html@2.17.5");
    expect(calculateReadingTime(`<p>${"word ".repeat(221)}</p>`)).toBe(2);
  });
});
