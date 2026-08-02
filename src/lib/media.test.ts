import { describe, expect, test } from "bun:test";
import { resolveMediaUrl } from "./media";

const SUPABASE_URL = "https://botolago-test.supabase.co";

describe("resolveMediaUrl", () => {
  test("prefers a validated HTTPS source over storage", () => {
    expect(
      resolveMediaUrl(
        {
          sourceUrl: "https://cdn.example.com/crests/raja.png",
          storagePath: "football/teams/1/crest.png",
        },
        SUPABASE_URL,
      ),
    ).toBe("https://cdn.example.com/crests/raja.png");
  });

  test("resolves football objects through football-media", () => {
    expect(resolveMediaUrl({ storagePath: "football/teams/1001/crest.png" }, SUPABASE_URL)).toBe(
      `${SUPABASE_URL}/storage/v1/object/public/football-media/football/teams/1001/crest.png`,
    );
  });

  test("resolves news objects through news-media and encodes every path segment", () => {
    expect(resolveMediaUrl({ storagePath: "news/Équipe du jour/hero #1.webp" }, SUPABASE_URL)).toBe(
      `${SUPABASE_URL}/storage/v1/object/public/news-media/news/%C3%89quipe%20du%20jour/hero%20%231.webp`,
    );
  });

  test("falls back from an invalid source URL to a valid storage path", () => {
    expect(
      resolveMediaUrl(
        { sourceUrl: "http://cdn.example.com/hero.jpg", storagePath: "news/hero.jpg" },
        SUPABASE_URL,
      ),
    ).toBe(`${SUPABASE_URL}/storage/v1/object/public/news-media/news/hero.jpg`);
  });

  test("returns no URL without configuration or valid media data", () => {
    expect(resolveMediaUrl({ storagePath: "news/hero.jpg" }, null)).toBeUndefined();
    expect(resolveMediaUrl({ storagePath: "other/hero.jpg" }, SUPABASE_URL)).toBeUndefined();
    expect(resolveMediaUrl({ storagePath: "news/../hero.jpg" }, SUPABASE_URL)).toBeUndefined();
    expect(resolveMediaUrl(undefined, SUPABASE_URL)).toBeUndefined();
  });
});
