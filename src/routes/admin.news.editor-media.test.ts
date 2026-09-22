import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The cover image's alt text, caption and credit (News CMS activation audit).
 *
 * `news-media-upload` has always accepted `caption` and `credit` and required
 * `altText`, and the public article renders caption/credit under the photo.
 * The editor sent neither, and filled `altText` with the article title -- so
 * every cover was described to screen readers as its headline, and no photo
 * could ever carry a credit. The route is a client component with no render
 * harness in this repository, so these checks tie the upload call to the
 * fields that feed it.
 */
const source = readFileSync(join(import.meta.dir, "admin.news.$articleEditionId.tsx"), "utf8");

function uploadHeroBody(): string {
  const start = source.indexOf("const uploadHero = async");
  const end = source.indexOf("const insertBodyImage = async");
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("cover image metadata in the editor", () => {
  test("alt text is what the editor typed, never the article title", () => {
    const body = uploadHeroBody();
    expect(body).not.toContain("uploadNewsMedia(file, title");
    expect(body).not.toContain('"Article hero image"');
    expect(body).toContain("heroAlt.trim()");
  });

  test("an upload without alt text is refused before any bytes leave the browser", () => {
    const body = uploadHeroBody();
    const guard = body.indexOf("if (!heroAlt.trim())");
    const upload = body.indexOf("uploadNewsMedia(");
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(upload);
  });

  test("caption and credit are sent with the upload", () => {
    expect(uploadHeroBody()).toContain("caption: heroCaption");
    expect(uploadHeroBody()).toContain("credit: heroCredit");
    expect(source).toContain('form.set("caption"');
    expect(source).toContain('form.set("credit"');
  });

  test("the three fields and the current cover are on the page", () => {
    for (const id of [
      "admin-news-hero-alt",
      "admin-news-hero-caption",
      "admin-news-hero-credit",
      "admin-news-hero-preview",
      "admin-news-hero-input",
    ]) {
      expect(`${id}: ${source.includes(`data-testid="${id}"`)}`).toBe(`${id}: true`);
    }
  });

  test("the file picker stays disabled until alt text is present", () => {
    expect(source).toContain("disabled={!isEditable || busy || !heroAlt.trim()}");
  });
});
